/* Sistema de Ponto: ESP32 classico + RC522 + LCD I2C.
 * Usa o LOGIN TITULAR da empresa, conforme as regras atuais do site.
 * Dependencias: Firebase ESP32 Client (Mobizt / FirebaseESP32.h),
 * MFRC522 e LiquidCrystal_I2C. Nao confundir com Firebase_ESP_Client.h.
 * Acionamento somente pelo cartao RFID RC522.
 */
#include "config.h"
#ifndef CONTA_ID
#define CONTA_ID EMPRESA_UID
#endif
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <FirebaseESP32.h>
#include <Preferences.h>
#include <esp_system.h>
#include <time.h>

// PREENCHA: nao publique suas senhas junto com o firmware.





#define DATABASE_URL "https://mixponto-ffe50-default-rtdb.firebaseio.com"

// UID da conta titular: Firebase Console > Authentication > Usuarios.
// Evita que um login preenchido incorretamente envie pontos a outra conta.


// Os vinculos dos cartoes sao administrados no cadastro do site.
const uint32_t INTERVALO_CARTAO_MS = 10000;
const uint32_t RETENTATIVA_MS = 15000;

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
Preferences memoria;
LiquidCrystal_I2C lcd(0x27, 16, 2);
MFRC522 rfid(5, 4);
const int ledPin = 27, buzzerPin = 26;

String ultimoCartao, pendPath, pendBody, pendTenant;
uint32_t ultimaLeitura = 0, ultimaTentativa = 0, ultimaRede = 0;
uint32_t ultimaTela = 0;
String tela1, tela2;
bool memoriaOK = false;

void mostrar(const String &a, const String &b) {
  if (a == tela1 && b == tela2) return;
  tela1 = a; tela2 = b;
  lcd.clear();
  lcd.setCursor(0, 0); lcd.print(a.substring(0, 16));
  lcd.setCursor(0, 1); lcd.print(b.substring(0, 16));
  Serial.println(a + " | " + b);
}

void bip(int ms) {
  tone(buzzerPin, 5000); delay(ms); noTone(buzzerPin);
}

void aviso(const String &a, const String &b) {
  mostrar(a, b); bip(450); delay(1800);
}

bool chaveValida(const String &s) {
  if (!s.length()) return false;
  for (size_t i = 0; i < s.length(); i++)
    if ((uint8_t)s[i] < 32 || s[i] == 127 ||
        String(".#$[]/").indexOf(s[i]) >= 0) return false;
  return true;
}

bool horarioValido() { return time(nullptr) > 1704067200; }

bool criarHorario(String &dia, String &timestamp) {
  time_t agora = time(nullptr);
  if (agora <= 1704067200) return false;
  struct tm local, utc;
  localtime_r(&agora, &local);
  gmtime_r(&agora, &utc);
  char d[11], t[25];
  strftime(d, sizeof(d), "%Y-%m-%d", &local);
  strftime(t, sizeof(t), "%Y-%m-%dT%H:%M:%S.000Z", &utc);
  dia = d; timestamp = t;
  return true;
}

// Guarda UMA batida pendente em flash ANTES de tentar transmitir.
// Enquanto pendente, o terminal nao aceita outros cartoes.
bool guardarPendente() {
  FirebaseJson pacote;
  pacote.set("tenant", pendTenant);
  pacote.set("path", pendPath);
  pacote.set("body", pendBody);
  String raw; pacote.toString(raw, false);
  return memoria.putString("pendente", raw) == raw.length();
}

bool carregarPendente() {
  String raw = memoria.getString("pendente", "");
  if (!raw.length()) return true;
  FirebaseJson pacote; pacote.setJsonData(raw);
  FirebaseJsonData valor;
  if (!pacote.get(valor, "tenant") || valor.type != "string") return false;
  pendTenant = valor.stringValue;
  if (!pacote.get(valor, "path") || valor.type != "string") return false;
  pendPath = valor.stringValue;
  if (!pacote.get(valor, "body") || valor.type != "string") return false;
  pendBody = valor.stringValue;
  return chaveValida(pendTenant) && pendBody.length() &&
    pendPath.startsWith("/contas/" + pendTenant + "/registros/");
}

void enviarPendente() {
  ultimaTentativa = millis();
  String uid = auth.token.uid.c_str();
  if (uid != EMPRESA_UID || pendTenant != CONTA_ID) {
    mostrar("CONTA DIFERENTE", "Verifique UID"); return;
  }
  // Uma reserva por ETag impede corrida entre RFID, outro terminal e o app.
  String suffix = pendPath.substring(String("/contas/" + pendTenant + "/registros/").length());
  int firstSlash = suffix.indexOf('/'), lastSlash = suffix.lastIndexOf('/');
  if (firstSlash < 0 || lastSlash <= firstSlash) {
    mostrar("PENDENTE INVALIDO", "Verifique memoria"); return;
  }
  String funcionario = suffix.substring(firstSlash + 1, lastSlash);
  String evento = suffix.substring(lastSlash + 1);
  String controle = "/contas/" + pendTenant + "/controleBatidas/" + funcionario;
  if (!Firebase.get(fbdo, controle)) {
    mostrar("ERRO CONSULTA", "Ponto pendente"); return;
  }
  String etag = fbdo.ETag();
  FirebaseJsonData item;
  String reservado;
  double ultima = 0;
  if (fbdo.dataType() == "json") {
    FirebaseJson &estado = fbdo.jsonObject();
    if (estado.get(item, "requestId")) reservado = item.stringValue;
    if (estado.get(item, "timestamp")) ultima = item.doubleValue;
  }
  // Se a gravacao anterior ja chegou ao servidor, nao altera a reserva.
  if (reservado != evento) {
    if (!Firebase.get(fbdo, pendPath)) {
      mostrar("ERRO CONSULTA", "Ponto pendente"); return;
    }
    bool jaSalvo = fbdo.dataType() == "json";
    if (!jaSalvo) {
      FirebaseJson original; original.setJsonData(pendBody);
      FirebaseJsonData horario;
      struct tm instante = {};
      if (!original.get(horario, "timestamp") ||
          !strptime(horario.stringValue.c_str(), "%Y-%m-%dT%H:%M:%S", &instante)) {
        mostrar("HORARIO INVALIDO", "Verifique pendente"); return;
      }
      // mktime usa BRT3; o texto pendente esta em UTC.
      double capturado = ((double)mktime(&instante) - 10800) * 1000;
      if (capturado - ultima > -300000 && capturado - ultima < 300000) {
        if (!memoria.remove("pendente")) {
          mostrar("ERRO MEMORIA", "Verifique pendente"); return;
        }
        pendPath = ""; pendBody = ""; pendTenant = "";
        aviso("PONTO RECUSADO", "INTERVALO 5 MIN"); return;
      }
      double agora = (double)time(nullptr) * 1000;
      if (agora - ultima < 300000) {
        mostrar("AGUARDE 5 MIN", "Ponto pendente"); return;
      }
      FirebaseJson reserva;
      reserva.set("timestamp/.sv", "timestamp");
      reserva.set("requestId", evento);
      reserva.set("authUid", uid);
      reserva.set("origem", "esp32");
      if (!Firebase.setJSON(fbdo, controle, reserva, etag)) {
        mostrar("RESERVA PENDENTE", "Tentara de novo"); return;
      }
    }
  }
  FirebaseJson json; json.setJsonData(pendBody);
  mostrar("Enviando ponto", "Aguarde...");
  // Chave fixa da batida: repetir este envio nao cria outra batida.
  if (!Firebase.setJSON(fbdo, pendPath, json)) {
    Serial.println("Falha de gravacao: " + fbdo.errorReason());
    mostrar("PONTO PENDENTE", "Tentara de novo"); return;
  }
  // So limpa depois de o Firebase confirmar. Se desligar antes da limpeza,
  // o mesmo registro sera reenviado na mesma chave.
  if (!memoria.remove("pendente")) {
    mostrar("ERRO MEMORIA", "Ponto ja enviado"); return;
  }
  pendPath = ""; pendBody = ""; pendTenant = "";
  digitalWrite(ledPin, HIGH);
  mostrar("PONTO REGISTRADO", "Obrigado!");
  bip(150); delay(100); bip(150); delay(1500);
  digitalWrite(ledPin, LOW);
}

void registrar(const String &cartao) {
  String dia, timestamp;
  if (!criarHorario(dia, timestamp)) {
    aviso("SEM HORARIO NTP", "Aguarde a rede"); return;
  }
  String titular = CONTA_ID;
  if (String(auth.token.uid.c_str()) != EMPRESA_UID) {
    aviso("CONTA DIFERENTE", "Verifique login"); return;
  }
  mostrar("Buscando cartao", "Aguarde...");
  if (!Firebase.get(fbdo, "/contas/" + titular + "/cartoes/" + cartao)) {
    Serial.println("Falha ao consultar cartao: " + fbdo.errorReason());
    aviso("ERRO CONSULTA", "Verifique rede"); return;
  }
  if (fbdo.dataType() != "string") {
    aviso("CARTAO SEM LINK", "Vincule no site"); return;
  }
  String funcionario = fbdo.stringData();
  if (!chaveValida(funcionario)) {
    aviso("VINCULO INVALIDO", "Verifique no site"); return;
  }
  String base = "/contas/" + titular + "/funcionarios/" + funcionario;
  // Confirma o vinculo atual: um indice antigo nunca deve liberar o cartao.
  if (!Firebase.get(fbdo, base + "/cartaoUid")) {
    aviso("ERRO CONSULTA", "Verifique rede"); return;
  }
  if (fbdo.dataType() != "string" || fbdo.stringData() != cartao) {
    aviso("CARTAO SEM LINK", "Vincule no site"); return;
  }
  // Le somente campos pequenos: o cadastro pode conter uma foto grande.
  mostrar("Consultando", "Funcionario...");
  if (!Firebase.getString(fbdo, base + "/nome") || fbdo.dataType() != "string") {
    Serial.println("Falha ao consultar nome: " + fbdo.errorReason());
    aviso("SEM CADASTRO", "Verifique ID/rede"); return;
  }
  String nome = fbdo.stringData();
  if (!nome.length()) { aviso("CADASTRO INVALIDO", "Nome vazio"); return; }
  if (!Firebase.getString(fbdo, base + "/status") || fbdo.dataType() != "string") {
    aviso("SEM SITUACAO", "Verifique cadastro"); return;
  }
  if (fbdo.stringData() != "ativo") {
    aviso("FUNC. INATIVO", "Procure o RH"); return;
  }
  String admissao;
  if (!Firebase.getString(fbdo, base + "/admissao") || fbdo.dataType() != "string") {
    aviso("SEM ADMISSAO", "Verifique cadastro"); return;
  }
  admissao = fbdo.stringData();
  if (admissao.length() != 10 || dia < admissao) {
    aviso("ANTES ADMISSAO", "Procure o RH"); return;
  }
  String controle = "/contas/" + titular + "/controleBatidas/" + funcionario;
  if (!Firebase.get(fbdo, controle)) {
    aviso("ERRO CONSULTA", "Verifique rede"); return;
  }
  if (fbdo.dataType() == "json") {
    FirebaseJsonData ultima;
    if (fbdo.jsonObject().get(ultima, "timestamp") && (double)time(nullptr) * 1000 - ultima.doubleValue < 300000) {
      aviso("AGUARDE 5 MIN", "ENTRE BATIDAS"); return;
    }
  }
  char evento[80];
  uint64_t chip = ESP.getEfuseMac();
  snprintf(evento, sizeof(evento), "esp_%08lx_%04lx%08lx_%08lx%08lx",
    (unsigned long)time(nullptr), (unsigned long)(chip >> 32),
    (unsigned long)(chip & 0xffffffffULL),
    (unsigned long)esp_random(), (unsigned long)esp_random());
  FirebaseJson json;
  json.set("nome", nome);
  json.set("timestamp", timestamp);
  json.set("uidCartao", cartao);
  json.set("origem", "esp32");
  json.toString(pendBody, false);
  pendTenant = titular;
  pendPath = "/contas/" + titular + "/registros/" + dia + "/" + funcionario + "/" + evento;
  if (!guardarPendente()) {
    pendPath = ""; pendBody = ""; pendTenant = "";
    aviso("ERRO MEMORIA", "Ponto nao salvo"); return;
  }
  enviarPendente();
}

void setup() {
  Serial.begin(115200);
  pinMode(ledPin, OUTPUT); pinMode(buzzerPin, OUTPUT);
  Wire.begin(21, 22);
  lcd.init(); lcd.backlight();
  SPI.begin(18, 19, 23, 5); rfid.PCD_Init();
  memoriaOK = memoria.begin("mixponto", false);
  if (memoriaOK) memoriaOK = carregarPendente();
  WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  // POSIX: BRT3 = UTC-3. O timestamp enviado usa UTC com Z.
  configTzTime("BRT3", "pool.ntp.org", "time.google.com");
  config.api_key = API_KEY;
  config.database_url = DATABASE_URL;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  fbdo.setBSSLBufferSize(4096, 1024);
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);
  mostrar("INICIANDO", "WiFi / Firebase");
}

void loop() {
  // Deve rodar regularmente, inclusive quando nao ha cartao, para renovar token.
  bool pronto = Firebase.ready();
  if (!memoriaOK) {
    mostrar("ERRO MEMORIA", "Verifique terminal"); delay(50); return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    mostrar(pendPath.length() ? "PONTO PENDENTE" : "SEM WIFI", "Reconectando...");
    if (millis() - ultimaRede >= 15000) { ultimaRede = millis(); WiFi.reconnect(); }
    delay(30); return;
  }
  if (!horarioValido()) {
    mostrar("SINCRONIZANDO", "Horario NTP..."); delay(30); return;
  }
  if (!pronto) {
    mostrar("AUTENTICANDO", "Verifique login"); delay(30); return;
  }
  if (String(auth.token.uid.c_str()) != EMPRESA_UID) {
    mostrar("CONTA DIFERENTE", "Verifique UID"); delay(30); return;
  }
  if (pendPath.length()) {
    mostrar("PONTO PENDENTE", "Aguarde envio");
    if (millis() - ultimaTentativa >= RETENTATIVA_MS) enviarPendente();
    delay(30); return;
  }
  mostrar("SISTEMA DE PONTO", "APROXIME CARTAO");
  if (millis() - ultimaTela < 80) { delay(5); return; }
  ultimaTela = millis();
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return;
  String cartao;
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 16) cartao += '0';
    cartao += String(rfid.uid.uidByte[i], HEX);
  }
  cartao.toUpperCase();
  rfid.PICC_HaltA(); rfid.PCD_StopCrypto1();
  Serial.println("Cartao UID: " + cartao);
  if (cartao == ultimoCartao && millis() - ultimaLeitura < INTERVALO_CARTAO_MS) return;
  ultimoCartao = cartao; ultimaLeitura = millis();
  registrar(cartao);
}
