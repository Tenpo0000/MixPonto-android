package br.com.mixponto.app

import android.content.Intent
import android.graphics.drawable.StateListDrawable
import android.app.Activity
import android.app.AlertDialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import com.google.firebase.FirebaseApp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var repository: PontoRepository
    private lateinit var body: LinearLayout
    private lateinit var feedback: TextView
    private lateinit var progress: ProgressBar
    private val controls = mutableListOf<View>()
    private var backgrounded = false
    private val blue = Color.rgb(36, 88, 211)
    private val ink = Color.rgb(25, 34, 51)
    private val muted = Color.rgb(91, 103, 122)
    private val zone = ZoneId.of("America/Sao_Paulo")

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (FirebaseApp.initializeApp(this) == null) {
            screen("Configure o Firebase", "Adicione app/google-services.json e compile novamente.")
            return
        }
        repository = PontoRepository(this)
        if (repository.auth.currentUser == null || repository.companyId.isEmpty()) login() else loadProfile()
    }

    override fun onStop() {
        super.onStop()
        backgrounded = true
    }

    override fun onStart() {
        super.onStart()
        if (backgrounded && ::repository.isInitialized) {
            backgrounded = false
            if (repository.auth.currentUser == null || repository.companyId.isEmpty()) login() else loadProfile()
        }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun shape(color: Int): GradientDrawable = GradientDrawable().apply {
        setColor(color)
        cornerRadius = dp(12).toFloat()
    }

    private fun screen(title: String, subtitle: String) {
        controls.clear()
        body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(28), dp(24), dp(28))
        }
        setContentView(legalScroll(body).apply { setBackgroundColor(Color.rgb(245, 247, 251)) })
        text("MIXPONTO", 13, blue, true)
        button("Privacidade, termos e meus direitos", networkControl = false) { startActivity(Intent(this, LegalActivity::class.java)) }
        text(title, 30, ink, true).apply {
            if (Build.VERSION.SDK_INT >= 28) isAccessibilityHeading = true
        }
        text(subtitle, 16, muted)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            visibility = View.GONE
        }
        body.addView(progress)
        feedback = text("", 14, Color.rgb(160, 35, 35)).apply {
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
    }

    private fun text(value: String, size: Int = 16, color: Int = ink, bold: Boolean = false): TextView {
        return TextView(this).apply {
            this.text = value
            textSize = size.toFloat()
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(8), 0, dp(8))
            body.addView(this)
        }
    }

    private fun field(label: String, password: Boolean = false): EditText {
        val labelView = text(label, 14, muted)
        return EditText(this).apply {
            id = View.generateViewId()
            labelView.labelFor = id
            setTextColor(ink)
            setHintTextColor(muted)
            hint = label
            isSaveEnabled = !password
            contentDescription = label
            isSingleLine = true
            inputType = InputType.TYPE_CLASS_TEXT or if (password)
                InputType.TYPE_TEXT_VARIATION_PASSWORD else InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
            background = shape(Color.WHITE)
            setPadding(dp(14), 0, dp(14), 0)
            minimumHeight = dp(56)
            body.addView(this, LinearLayout.LayoutParams(-1, -2))
            controls.add(this)
        }
    }

    private fun button(label: String, primary: Boolean = false, networkControl: Boolean = true, action: () -> Unit) {
        val button = Button(this).apply {
            text = label
            isAllCaps = false
            textSize = 16f
            setTextColor(if (primary) Color.WHITE else blue)
            background = StateListDrawable().apply {
                addState(intArrayOf(android.R.attr.state_focused), shape(if (primary) blue else Color.rgb(229, 238, 255)).apply { setStroke(dp(3), ink) })
                addState(intArrayOf(), shape(if (primary) blue else Color.TRANSPARENT))
            }
            minimumHeight = dp(56)
            setPadding(dp(12), dp(10), dp(12), dp(10))
            setOnClickListener { action() }
        }
        body.addView(button, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })
        if (networkControl) controls.add(button)
    }

    private fun busy(value: Boolean) {
        progress.visibility = if (value) View.VISIBLE else View.GONE
        controls.forEach { it.isEnabled = !value }
    }

    private fun login() {
        screen("Seu ponto, aqui", "Entre com o e-mail e a senha fornecidos pelo administrador da empresa.")
        val company = field("ID da conta").apply { inputType = InputType.TYPE_CLASS_NUMBER; setText(repository.companyId) }
        val email = field("E-mail")
        email.setText(repository.auth.currentUser?.email ?: "")
        val password = field("Senha", true)
        button("Entrar", true) {
            val mail = email.text.toString().trim()
            val pass = password.text.toString()
            val companyId = company.text.toString().trim()
            if (!Regex("[1-9][0-9]{0,8}").matches(companyId)) {
                feedback.setText(R.string.login_company_required)
            } else if (mail.isEmpty() || pass.isEmpty()) {
                feedback.setText(R.string.login_credentials_required)
            } else {
                busy(true)
                repository.auth.signInWithEmailAndPassword(mail, pass).addOnCompleteListener(this) {
                    if (!it.isSuccessful) {
                        busy(false)
                        feedback.text = repository.error(it.exception!!)
                    } else if (!repository.selectCompany(companyId)) {
                        busy(false)
                        feedback.setText(R.string.login_company_save_error)
                    } else { password.text.clear(); loadProfile() }
                }
            }
        }
        button("Esqueci minha senha") {
            val mail = email.text.toString().trim()
            if (mail.isEmpty()) feedback.setText(R.string.login_email_required)
            else {
                busy(true)
                repository.auth.sendPasswordResetEmail(mail).addOnCompleteListener(this) {
                    busy(false)
                    feedback.text = if (it.isSuccessful) "Se houver uma conta, confira seu e-mail para recuperar a senha."
                        else repository.error(it.exception!!)
                }
            }
        }
        text("O acesso é criado pelo administrador e vinculado ao seu cadastro de funcionário.", 13, muted)
    }

    private fun logout() {
        repository.auth.signOut()
        login()
    }

    private fun status(title: String, description: String) {
        screen(title, description)
        text(repository.auth.currentUser?.email ?: "", 14, muted)
        button("Atualizar acesso", true) { loadProfile() }
        button("Trocar empresa") { logout() }
        button("Sair") { logout() }
    }

    private fun loadProfile() {
        val user = repository.auth.currentUser ?: return login()
        screen("Carregando seu acesso", "Consultando as informações do sistema.")
        busy(true)
        user.reload().continueWithTask { reload ->
            if (!reload.isSuccessful) throw reload.exception!!
            user.getIdToken(true)
        }.continueWithTask { token ->
            if (!token.isSuccessful) throw token.exception!!
            repository.profile()
        }.addOnCompleteListener(this) {
            if (!it.isSuccessful) status("Confira seu acesso", repository.error(it.exception!!))
            else home(it.result)
        }
    }

    private fun format(timestamp: Any?, pattern: String): String = runCatching {
        DateTimeFormatter.ofPattern(pattern, Locale.forLanguageTag("pt-BR"))
            .withZone(zone).format(Instant.parse(timestamp.toString()))
    }.getOrDefault("—")

    private fun home(profile: Map<*, *>) {
        screen("Olá, ${profile["nome"]}", "${profile["empresa"]} · Matrícula ${profile["matricula"]}")
        text("ID da conta: ${repository.companyId}", 13, muted)
        val records = (profile["registros"] as? List<*>)?.filterIsInstance<Map<*, *>>() ?: emptyList()
        val today = records.filter { it["dia"] == profile["hoje"] }
        text(if (today.size % 2 == 1) "Em jornada" else "Fora da jornada", 24, ink, true)
        text("${today.size} batida(s) hoje", 16, muted)
        if (repository.hasPending()) text("Existe um envio pendente de confirmação. Tente novamente para consultar ou concluir a mesma solicitação.", 14, muted)
        button(if (repository.hasPending()) "Confirmar envio pendente" else "Bater ponto agora", true) {
            AlertDialog.Builder(this).setTitle("Registrar ponto?")
                .setMessage("O sistema usará o horário do servidor. É necessário estar conectado à internet.")
                .setNegativeButton("Cancelar", null).setPositiveButton("Confirmar") { _, _ -> punch() }.show()
        }
        button("Atualizar batidas") { loadProfile() }
        text("Últimos 7 dias", 21, ink, true)
        if (records.isEmpty()) text("Nenhuma batida nesse período.", 15, muted)
        records.sortedByDescending { it["timestamp"].toString() }.forEach { r ->
            text("${format(r["timestamp"], "HH:mm:ss")}  ·  ${r["tipo"]}", 17, ink, true)
            val source = when (r["origem"]) { "android" -> "Aplicativo"; "manual" -> "Inclusão manual"; else -> "Terminal" }
            text("${format(r["timestamp"], "dd/MM/yyyy")} · $source", 14, muted)
        }
        text("Horário de Brasília. Entrada, intervalo e saída seguem a ordem das batidas do dia.", 13, muted)
        button("Sair") { logout() }
    }

    private fun punch() {
        busy(true)
        try {
            repository.punch().addOnCompleteListener(this) {
                if (!it.isSuccessful) {
                    busy(false)
                    feedback.text = repository.error(it.exception!!)
                } else {
                    AlertDialog.Builder(this).setTitle("Ponto registrado")
                        .setMessage("${format(it.result["timestamp"], "dd/MM/yyyy HH:mm:ss")}\nHorário de Brasília.\nA batida já está disponível no cartão ponto.")
                        .setCancelable(false).setPositiveButton("Concluir") { _, _ -> loadProfile() }.show()
                }
            }
        } catch (error: Exception) {
            busy(false)
            feedback.text = repository.error(error)
        }
    }

}

