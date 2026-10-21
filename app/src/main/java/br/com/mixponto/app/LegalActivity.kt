package br.com.mixponto.app

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.text.util.Linkify
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import org.json.JSONObject

/** Conteúdo local compartilhado com o site: consultar políticas não exige login ou rede. */
class LegalActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = "Privacidade e termos"
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val padding = (20 * resources.displayMetrics.density).toInt()
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.WHITE)
        }
        val scroll = legalScroll(body)
        setContentView(scroll)
        fun text(value: String, heading: Boolean = false) {
            body.addView(TextView(this).apply {
                text = value
                textSize = if (heading) 21f else 16f
                setTextColor(Color.rgb(38, 54, 80))
                setPadding(0, 18, 0, 18)
                if (Build.VERSION.SDK_INT >= 28) isAccessibilityHeading = heading
                setTextIsSelectable(true)
                autoLinkMask = Linkify.WEB_URLS
            })
        }
        fun button(label: String, action: () -> Unit) {
            body.addView(Button(this).apply {
                text = label
                isAllCaps = false
                minimumHeight = (48 * resources.displayMetrics.density).toInt()
                setTextColor(Color.rgb(6, 78, 178))
                setOnClickListener { action() }
            })
        }
        button("Voltar") { finish() }
        text("Privacidade e termos", true)
        button("Solicitações de privacidade e acessibilidade") {
            startActivity(Intent(this, PrivacyActivity::class.java))
        }
        try {
            val policy = JSONObject(assets.open("politicas.json").bufferedReader().use { it.readText() })
            text("Versão ${policy.getString("versao")} · ${policy.getString("atualizadoEm")} · ${policy.getString("estado")}")
            text(policy.getString("aviso"))
            val owner = policy.getJSONObject("responsavel")
            text("Responsável pelo serviço", true)
            for ((key, label) in listOf("nome" to "Nome", "documento" to "Documento, se aplicável", "endereco" to "Endereço", "emailPrivacidade" to "Contato"))
                text("$label: ${owner.optString(key).ifBlank { "ainda não definido" }}")
            val documents = policy.getJSONArray("documentos")
            val headings = mutableListOf<Pair<String, Int>>()
            val navigation = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
            body.addView(navigation)
            for (index in 0 until documents.length()) {
                val document = documents.getJSONObject(index)
                val headingIndex = body.childCount
                text(document.getString("titulo"), true)
                headings += document.getString("titulo") to headingIndex
                val sections = document.getJSONArray("secoes")
                for (sectionIndex in 0 until sections.length()) {
                    val section = sections.getJSONObject(sectionIndex)
                    text(section.getString("titulo"), true)
                    text(section.getString("texto"))
                }
            }
            headings.forEach { (label, index) ->
                navigation.addView(Button(this).apply {
                    text = label
                    isAllCaps = false
                    setOnClickListener {
                        val target = body.getChildAt(index)
                        scroll.scrollTo(0, target.top)
                        target.isFocusableInTouchMode = true
                        target.requestFocus()
                        target.sendAccessibilityEvent(android.view.accessibility.AccessibilityEvent.TYPE_VIEW_FOCUSED)
                    }
                })
            }
            val sources = policy.getJSONArray("fontes")
            text("Referências oficiais", true)
            for (index in 0 until sources.length()) {
                val source = sources.getJSONObject(index)
                text("${source.getString("titulo")}\n${source.getString("url")}")
            }
        } catch (_: Exception) {
            text("Não foi possível abrir os textos locais. Procure a empresa responsável e atualize o aplicativo.")
        }
    }
}
