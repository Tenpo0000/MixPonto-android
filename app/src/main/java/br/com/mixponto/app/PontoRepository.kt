package br.com.mixponto.app

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthException
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.Executors

private class AccessError(message: String) : Exception(message)
private class DatabaseDenied : Exception()

class PontoRepository(context: Context) {
    companion object { private val pendingLock = Any() }
    val auth: FirebaseAuth = FirebaseAuth.getInstance()
    private val pending = context.getSharedPreferences("point_requests_spark", Context.MODE_PRIVATE)
    val companyId: String get() = pending.getString("selected_company", "") ?: ""
    private var accountId = ""
    fun selectCompany(value: String): Boolean {
        val id = value.trim()
        if (!Regex("[1-9][0-9]{0,8}").matches(id)) return false
        accountId = ""
        return pending.edit().putString("selected_company", id).commit()
    }
    private val executor = Executors.newSingleThreadExecutor()
    private val zone = ZoneId.of("America/Sao_Paulo")
    private val databaseUrl = FirebaseApp.getInstance().options.databaseUrl
        ?: "https://mixponto-ffe50-default-rtdb.firebaseio.com"

    // REST faz leituras exclusivamente no servidor e não mantém uma fila de escritas offline.
    private fun request(method: String, path: String, value: JSONObject? = null, query: String = ""): Any? {
        val user = auth.currentUser ?: throw AccessError("Entre novamente.")
        val company = companyId
        if (company.isEmpty()) throw AccessError("Informe o ID da conta na tela de login.")
        if (path.startsWith("contas/") && (accountId.isEmpty() || path.split('/').getOrNull(1) != accountId))
            throw AccessError("A empresa da requisição não corresponde à empresa selecionada.")
        val token = Tasks.await(user.getIdToken(false)).token ?: throw AccessError("Entre novamente.")
        val encoded = path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8") }
        val connection = URI("${databaseUrl.trimEnd('/')}/$encoded.json?auth=${URLEncoder.encode(token, "UTF-8")}$query")
            .toURL().openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.useCaches = false
            connection.setRequestProperty("X-Conta-ID", company)
            if (value != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(value.toString().toByteArray(Charsets.UTF_8)) }
            }
            val code = connection.responseCode
            if (code == 401 || code == 403) throw DatabaseDenied()
            if (code !in 200..299) throw AccessError("O servidor não confirmou o envio. Confira a internet e tente novamente.")
            val raw = connection.inputStream.bufferedReader().use { it.readText() }
            return if (raw == "null") null else JSONTokener(raw).nextValue()
        } finally { connection.disconnect() }
    }

    private fun read(path: String, query: String = "") = request("GET", path, query = query) as? JSONObject ?: JSONObject()
    private fun scalar(path: String) = request("GET", path)?.toString() ?: ""
    private fun serverTime() = JSONObject().put(".sv", "timestamp")
    fun hasPending(): Boolean = pending.contains("pending_${companyId}_${auth.currentUser?.uid}") ||
        (accountId.isNotEmpty() && (pending.contains("pending_${accountId}_${auth.currentUser?.uid}") ||
        runCatching { JSONObject(pending.getString("pending_${auth.currentUser?.uid}", "{}") ?: "{}").optString("empresa") == accountId }.getOrDefault(false)))

    private fun link(): JSONObject {
        val uid = auth.currentUser?.uid ?: throw AccessError("Entre novamente.")
        val directory = read("contasPorId/$companyId")
        val company = directory.optString("contaId")
        val safeId = Regex("[a-zA-Z0-9_-]{1,128}")
        if (!safeId.matches(company))
            throw AccessError("ID de conta não encontrado. Copie o ID da conta mostrado no cabeçalho do site.")
        accountId = company
        val value = read("contas/$company/acessosMobile/$uid")
        if (!value.optBoolean("ativo")) throw AccessError("Seu acesso ainda não foi liberado ou foi revogado. Peça ao administrador para criar ou liberar o acesso pelo site. Use o e-mail individual fornecido por ele.")
        if (value.optString("empresaUid") != company) throw AccessError("Este acesso não pertence ao ID de conta informado.")
        return value
    }

    private fun checkEmployee(access: JSONObject): JSONObject {
        val base = "contas/${access.getString("empresaUid")}/funcionarios/${access.getString("funcionarioId")}"
        if (scalar("$base/status") != "ativo") throw AccessError("Funcionário desligado ou inativo. Procure o administrador.")
        val config = read("contas/${access.getString("empresaUid")}/mobileConfig/${access.getString("funcionarioId")}")
        if (config.optString("admissao") != scalar("$base/admissao") || config.optLong("admissaoEm", Long.MAX_VALUE) > System.currentTimeMillis())
            throw AccessError("Confira a data de admissão e atualize a autorização pelo site.")
        return config.put("nome", scalar("$base/nome")).put("matricula", scalar("$base/matricula"))
    }

    fun profile(): Task<Map<*, *>> = Tasks.call(executor) {
        val access = link()
        val config = checkEmployee(access)
        val base = "contas/${access.getString("empresaUid")}"
        val fid = access.getString("funcionarioId")
        val today = LocalDate.now(zone)
        val records = mutableListOf<Map<String, Any>>()
        val start = today.minusDays(6).atStartOfDay(zone).toInstant().toEpochMilli()
        val mobile = read("$base/batidasMobile/$fid", "&orderBy=%22timestamp%22&startAt=$start")
        mobile.keys().forEach { id ->
            val r = mobile.getJSONObject(id)
            val instant = Instant.ofEpochMilli(r.getLong("timestamp"))
            records.add(mapOf("id" to id, "dia" to instant.atZone(zone).toLocalDate().toString(), "timestamp" to instant.toString(), "origem" to "android"))
        }
        for (offset in 0L..6L) {
            val day = today.minusDays(offset).toString()
            val legacy = read("$base/registros/$day/$fid")
            legacy.keys().forEach { id ->
                val r = legacy.getJSONObject(id)
                val instant = parseTime(r.opt("timestamp"))
                if (instant != null) records.add(mapOf("id" to id, "dia" to day, "timestamp" to instant.toString(), "origem" to r.optString("origem", if (r.optBoolean("manual")) "manual" else "terminal")))
            }
        }
        val labels = listOf("Entrada", "Saída para intervalo", "Retorno", "Saída")
        val labeled = records.groupBy { it["dia"] }.values.flatMap { day ->
            day.sortedBy { it["timestamp"].toString() }.mapIndexed { index, r -> r + ("tipo" to (labels.getOrNull(index) ?: "Batida ${index + 1}")) }
        }
        mapOf("modo" to "funcionario", "nome" to config.optString("nome"), "matricula" to config.optString("matricula"), "empresa" to config.optString("empresa", "Sua empresa"), "hoje" to today.toString(), "registros" to labeled)
    }

    private fun parseTime(value: Any?): Instant? = runCatching {
        if (value is Number) Instant.ofEpochMilli(value.toLong()) else {
            val raw = value.toString()
            if (Regex(".*T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?$").matches(raw))
                LocalDateTime.parse(raw).toInstant(ZoneOffset.ofHours(-3)) else Instant.parse(raw)
        }
    }.getOrNull()

    fun punch(): Task<Map<*, *>> = Tasks.call(executor) {
        val uid = auth.currentUser?.uid ?: throw AccessError("Entre novamente.")
        val access = link()
        checkEmployee(access)
        val key = "pending_${companyId}_$uid"
        val attempt = synchronized(pendingLock) {
            val oldKeys = pending.all.keys.filter { it.startsWith("pending_") && it.endsWith("_$uid") && it != key }
            for (oldKey in oldKeys) {
                pending.getString(oldKey, null)?.let { old ->
                    val previous = JSONObject(old)
                    if (previous.optString("empresa") == accountId && previous.optString("funcionario") == access.getString("funcionarioId") && !pending.contains(key)) {
                        previous.put("codigoEmpresa", companyId)
                        check(pending.edit().putString(key, previous.toString()).remove(oldKey).commit()) { "Não foi possível restaurar o envio pendente." }
                    }
                }
            }
            pending.getString(key, null)?.let { JSONObject(it) }
                ?: JSONObject().put("id", UUID.randomUUID().toString())
                    .put("empresa", access.getString("empresaUid")).put("codigoEmpresa", companyId).put("funcionario", access.getString("funcionarioId")).also {
                        check(pending.edit().putString(key, it.toString()).commit()) { "Não foi possível preparar o envio." }
                    }
        }
        if (attempt.getString("empresa") != access.getString("empresaUid") || attempt.getString("funcionario") != access.getString("funcionarioId") || attempt.optString("codigoEmpresa") != companyId)
            throw AccessError("Há um envio pendente do vínculo anterior. Peça ao administrador para conferir o histórico e restaurar o vínculo para confirmar o envio.")
        val base = "contas/${attempt.getString("empresa")}"
        val fid = attempt.getString("funcionario")
        val id = attempt.getString("id")
        val path = "$base/batidasMobile/$fid/$id"
        var receipt = read(path)
        if (receipt.length() == 0) {
            checkEmployee(access)
            val event = JSONObject().put("timestamp", serverTime()).put("authUid", uid).put("origem", "android")
            val clock = JSONObject(event.toString()).put("requestId", id)
            try {
                request("PATCH", base, JSONObject().put("batidasMobile/$fid/$id", event).put("controleBatidas/$fid", clock))
            } catch (denied: DatabaseDenied) {
                receipt = read(path)
                if (receipt.length() == 0) {
                    checkEmployee(link())
                    throw AccessError("Registro recusado. Aguarde 5 minutos entre batidas. Se persistir, peça ao administrador para conferir a autorização e as regras.")
                }
            }
            if (receipt.length() == 0) receipt = read(path)
        }
        if (receipt.optString("authUid") != uid || !receipt.has("timestamp")) throw AccessError("Envio ainda não confirmado. Tente novamente.")
        synchronized(pendingLock) {
            if (pending.getString(key, null)?.let { JSONObject(it).optString("id") } == id)
                check(pending.edit().remove(key).commit()) { "Ponto salvo, mas a confirmação local está pendente. Tente novamente." }
        }
        mapOf("timestamp" to Instant.ofEpochMilli(receipt.getLong("timestamp")).toString())
    }

    fun error(exception: Exception): String {
        var error: Throwable = exception
        while (error.cause != null && error !is AccessError && error !is FirebaseAuthException && error !is DatabaseDenied) error = error.cause!!
        if (error is AccessError) return error.message ?: "Confira seu acesso."
        if (error is DatabaseDenied) return "Acesso não autorizado ou revogado. Atualize seu acesso; peça ao administrador para conferir o vínculo e as regras."
        if (error is FirebaseAuthException) return when (error.errorCode) {
            "ERROR_EMAIL_ALREADY_IN_USE" -> "Este e-mail já tem conta. Use Entrar."
            "ERROR_WEAK_PASSWORD" -> "Use uma senha mais forte."
            "ERROR_INVALID_EMAIL" -> "Confira o e-mail informado."
            "ERROR_TOO_MANY_REQUESTS" -> "Muitas tentativas. Aguarde antes de tentar novamente."
            else -> "Não foi possível entrar. Confira seu e-mail e senha."
        }
        return "Não foi possível confirmar com o servidor. Confira a internet e tente novamente; a mesma solicitação será reutilizada."
    }
}
