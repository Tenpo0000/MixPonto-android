package br.com.mixponto.app

import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.TaskCompletionSource
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import org.json.JSONObject
import org.json.JSONTokener
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder
import java.util.concurrent.Executors

/** Canal separado do ponto: uma pessoa pode exercer direitos mesmo com vínculo inativo. */
class PrivacyRepository {
    companion object {
        private val executor = Executors.newSingleThreadExecutor()
    }
    private fun <T> task(action: () -> T): Task<T> {
        val completion = TaskCompletionSource<T>()
        executor.execute {
            try { completion.setResult(action()) } catch (error: Exception) { completion.setException(error) }
        }
        return completion.task
    }
    private val auth = FirebaseAuth.getInstance()
    private val databaseUrl = FirebaseApp.getInstance().options.databaseUrl
        ?: "https://mixponto-ffe50-default-rtdb.firebaseio.com"

    private fun request(path: String, code: String, user: FirebaseUser, value: JSONObject? = null): JSONObject {
        check(auth.currentUser === user) { "A sessão mudou." }
        val token = Tasks.await(user.getIdToken(false)).token ?: error("Entre novamente.")
        check(auth.currentUser === user) { "A sessão mudou." }
        val encoded = path.split('/').joinToString("/") { URLEncoder.encode(it, "UTF-8") }
        val url = URI("${databaseUrl.trimEnd('/')}/$encoded.json?auth=${URLEncoder.encode(token, "UTF-8")}")
        val connection = url.toURL().openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 15000
            connection.readTimeout = 15000
            connection.useCaches = false
            connection.setRequestProperty("X-Conta-ID", code)
            if (value != null) {
                connection.requestMethod = "PUT"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { it.write(value.toString().toByteArray(Charsets.UTF_8)) }
            }
            check(connection.responseCode in 200..299) { "Não foi possível confirmar. Confira o ID, o vínculo e a conexão; procure a empresa responsável se persistir." }
            val raw = connection.inputStream.bufferedReader().use { it.readText() }
            check(auth.currentUser === user) { "A sessão mudou." }
            return JSONTokener(raw).nextValue() as? JSONObject ?: JSONObject()
        } finally { connection.disconnect() }
    }

    private fun account(code: String, user: FirebaseUser): String {
        require(Regex("[1-9][0-9]{0,8}").matches(code)) { "Informe o ID numérico da conta." }
        val id = request("contasPorId/$code", code, user).optString("contaId")
        require(Regex("[a-zA-Z0-9_-]{1,128}").matches(id)) { "Conta não encontrada." }
        return id
    }

    fun submit(code: String, type: String, details: String, protocol: String): Task<String> {
        // Captura a identidade antes de entrar na fila, evitando adotar outro login.
        val session = auth.currentUser
        return task {
            require(type in listOf("acesso", "correcao", "eliminacao", "informacao", "oposicao", "revogacao", "acessibilidade"))
            require(details.length <= 1000 && Regex("[0-9a-f-]{36}").matches(protocol))
            val user = session ?: error("Entre no aplicativo para registrar um pedido.")
            val path = "contas/${account(code, user)}/privacidade/${user.uid}/$protocol"
            val existing = request(path, code, user)
            if (existing.length() == 0) {
                request(path, code, user, JSONObject()
                    .put("tipo", type).put("detalhes", details).put("status", "recebida")
                    .put("criadoEm", JSONObject().put(".sv", "timestamp")))
            } else {
                // Uma repetição após falha de rede confirma o mesmo pedido, nunca outro conteúdo.
                check(existing.optString("tipo") == type && existing.optString("detalhes") == details) {
                    "Consulte o protocolo já registrado antes de enviar outro conteúdo."
                }
            }
            protocol
        }
    }

    fun list(code: String): Task<JSONObject> {
        val session = auth.currentUser
        return task {
            val user = session ?: error("Entre com seu próprio login.")
            request("contas/${account(code, user)}/privacidade/${user.uid}", code, user)
        }
    }
}
