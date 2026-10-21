package br.com.mixponto.app

import android.app.Activity
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.view.View
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import org.json.JSONArray
import java.util.UUID

class PrivacyActivity : Activity() {
    private var protocol = UUID.randomUUID().toString()
    private var signature: String? = null
    private var owner: FirebaseUser? = null
    private val controls = mutableListOf<View>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        protocol = savedInstanceState?.getString("protocol") ?: protocol
        signature = savedInstanceState?.getString("signature")
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val padding = (20 * resources.displayMetrics.density).toInt()
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.WHITE)
        }
        setContentView(legalScroll(body))
        fun text(value: String): TextView = TextView(this).apply {
            text = value
            textSize = 16f
            setTextColor(Color.rgb(38, 54, 80))
            setPadding(0, 14, 0, 14)
            body.addView(this)
        }
        body.addView(Button(this).apply { setText(R.string.privacy_back); setOnClickListener { finish() } })
        text("Solicitações de privacidade e acessibilidade").apply {
            textSize = 24f
            if (Build.VERSION.SDK_INT >= 28) isAccessibilityHeading = true
        }
        text("Não envie CPF, documentos, senhas ou dados de saúde. O protocolo registra um pedido; não apaga pontos automaticamente. A empresa responsável precisa analisar e responder.")
        val session = runCatching { FirebaseAuth.getInstance().currentUser }.getOrNull()
        owner = session
        if (session == null) {
            text("Entre no aplicativo com seu próprio login para registrar pedidos. Você também pode procurar a empresa empregadora pelos canais que ela disponibiliza.")
            return
        }
        val companyLabel = text("ID da conta")
        val company = EditText(this).apply {
            id = R.id.privacy_company
            inputType = InputType.TYPE_CLASS_NUMBER
            filters = arrayOf(InputFilter.LengthFilter(9))
            setText(getSharedPreferences("point_requests_spark", MODE_PRIVATE).getString("selected_company", ""))
            setTextColor(Color.rgb(38, 54, 80))
            minimumHeight = (48 * resources.displayMetrics.density).toInt()
            body.addView(this)
            controls.add(this)
        }
        companyLabel.labelFor = company.id
        val types = listOf("acesso", "correcao", "eliminacao", "informacao", "oposicao", "revogacao", "acessibilidade")
        val typeLabel = text("Tipo de pedido")
        val type = Spinner(this).apply {
            id = R.id.privacy_type
            minimumHeight = (48 * resources.displayMetrics.density).toInt()
            adapter = ArrayAdapter(this@PrivacyActivity, android.R.layout.simple_spinner_dropdown_item,
                listOf("Confirmação e acesso", "Correção", "Avaliar eliminação", "Uso e compartilhamento", "Oposição ou revisão", "Revogação de consentimento", "Barreira de acessibilidade"))
            body.addView(this)
            controls.add(this)
        }
        typeLabel.labelFor = type.id
        val detailsLabel = text("Contexto opcional (até 1.000 caracteres)")
        val details = EditText(this).apply {
            id = R.id.privacy_details
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO
            filters = arrayOf(InputFilter.LengthFilter(1000))
            minLines = 3
            setTextColor(Color.rgb(38, 54, 80))
            body.addView(this)
            controls.add(this)
        }
        detailsLabel.labelFor = details.id
        val feedback = text("").apply {
            id = R.id.privacy_feedback
            accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            setTextIsSelectable(true)
        }
        fun busy(value: Boolean) { controls.forEach { it.isEnabled = !value } }
        val repository = PrivacyRepository()
        body.addView(Button(this).apply {
            setText(R.string.privacy_submit)
            controls.add(this)
            setOnClickListener {
                if (FirebaseAuth.getInstance().currentUser !== session) { finish(); return@setOnClickListener }
                val code = company.text.toString().trim()
                val kind = types[type.selectedItemPosition]
                val context = details.text.toString().trim()
                val nextSignature = JSONArray(listOf(session.uid, code, kind, context)).toString()
                if (signature != nextSignature) { protocol = UUID.randomUUID().toString(); signature = nextSignature }
                busy(true)
                repository.submit(code, kind, context, protocol)
                    .addOnCompleteListener { result ->
                        if (isFinishing || isDestroyed) return@addOnCompleteListener
                        if (FirebaseAuth.getInstance().currentUser !== session) { details.text.clear(); feedback.text = ""; finish(); return@addOnCompleteListener }
                        busy(false)
                        if (result.isSuccessful) {
                            feedback.text = getString(R.string.privacy_success, result.result)
                            protocol = UUID.randomUUID().toString()
                            signature = null
                            details.text.clear()
                        } else feedback.setText(R.string.privacy_submit_error)
                    }
            }
        })
        body.addView(Button(this).apply {
            setText(R.string.privacy_list)
            controls.add(this)
            setOnClickListener {
                if (FirebaseAuth.getInstance().currentUser !== session) { finish(); return@setOnClickListener }
                busy(true)
                repository.list(company.text.toString().trim()).addOnCompleteListener { result ->
                    if (isFinishing || isDestroyed) return@addOnCompleteListener
                    if (FirebaseAuth.getInstance().currentUser !== session) { details.text.clear(); feedback.text = ""; finish(); return@addOnCompleteListener }
                    busy(false)
                    if (!result.isSuccessful) feedback.setText(R.string.privacy_list_error)
                    else {
                        val data = result.result
                        feedback.text = data.keys().asSequence().map { key ->
                            val item = data.getJSONObject(key)
                            "$key\n${item.optString("tipo")} · ${item.optString("status")}\n${item.optString("resposta", "Aguardando análise da empresa responsável.")}"
                        }.joinToString("\n\n").ifBlank { "Nenhum pedido encontrado nesta conta." }
                    }
                }
            }
        })
    }

    override fun onSaveInstanceState(outState: Bundle) {
        outState.putString("protocol", protocol)
        outState.putString("signature", signature)
        super.onSaveInstanceState(outState)
    }

    override fun onResume() {
        super.onResume()
        owner?.let { if (FirebaseAuth.getInstance().currentUser !== it) finish() }
    }
}
