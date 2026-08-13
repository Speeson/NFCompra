plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val debugApiBaseUrl = providers.gradleProperty("NFCompraApiBaseUrl")
    .orElse(providers.environmentVariable("NFCOMPRA_API_BASE_URL"))
    .orElse("https://api.nfcompra.esgarpe.dev/")
    .map { if (it.endsWith("/")) it else "$it/" }

val releaseKeystoreFile = providers.gradleProperty("NFCOMPRA_KEYSTORE_FILE")
    .orElse(providers.environmentVariable("NFCOMPRA_KEYSTORE_FILE"))
val releaseKeystorePassword = providers.gradleProperty("NFCOMPRA_KEYSTORE_PASSWORD")
    .orElse(providers.environmentVariable("NFCOMPRA_KEYSTORE_PASSWORD"))
val releaseKeyAlias = providers.gradleProperty("NFCOMPRA_KEY_ALIAS")
    .orElse(providers.environmentVariable("NFCOMPRA_KEY_ALIAS"))
val releaseKeyPassword = providers.gradleProperty("NFCOMPRA_KEY_PASSWORD")
    .orElse(providers.environmentVariable("NFCOMPRA_KEY_PASSWORD"))
val hasReleaseSigningConfig = releaseKeystoreFile.isPresent &&
    releaseKeystorePassword.isPresent &&
    releaseKeyAlias.isPresent &&
    releaseKeyPassword.isPresent

android {
    namespace = "dev.esgarpe.nfcompra"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.esgarpe.nfcompra"
        minSdk = 24
        targetSdk = 35
        versionCode = 12
        versionName = "0.1.11"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures { buildConfig = true }
    signingConfigs {
        if (hasReleaseSigningConfig) {
            create("release") {
                storeFile = file(releaseKeystoreFile.get())
                storePassword = releaseKeystorePassword.get()
                keyAlias = releaseKeyAlias.get()
                keyPassword = releaseKeyPassword.get()
            }
        }
    }
    buildTypes {
        debug {
            buildConfigField("String", "AUTH_BASE_URL", "\"${debugApiBaseUrl.get()}\"")
        }
        release {
            buildConfigField("String", "AUTH_BASE_URL", "\"https://api.nfcompra.esgarpe.dev/\"")
            if (hasReleaseSigningConfig) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:network"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:shoppinglist"))
    implementation(project(":feature:sharing"))
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.core:core:1.13.1")
    implementation("androidx.compose.material3:material3:1.3.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")

    testImplementation("junit:junit:4.13.2")
}
