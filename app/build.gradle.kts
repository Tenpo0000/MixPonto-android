plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}
android {
    namespace = "br.com.mixponto.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "br.com.mixponto.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 8
        versionName = "1.7.1"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.12.0"))
    implementation("com.google.firebase:firebase-auth")
}
