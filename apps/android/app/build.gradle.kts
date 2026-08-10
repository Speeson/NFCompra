plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val debugApiBaseUrl = providers.gradleProperty("NFCompraApiBaseUrl")
    .orElse(providers.environmentVariable("NFCOMPRA_API_BASE_URL"))
    .orElse("https://api.nfcompra.esgarpe.dev/")
    .map { if (it.endsWith("/")) it else "$it/" }

android {
    namespace = "dev.esgarpe.nfcompra"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.esgarpe.nfcompra"
        minSdk = 24
        targetSdk = 35
        versionCode = 2
        versionName = "0.1.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures { buildConfig = true }
    buildTypes {
        debug {
            buildConfigField("String", "AUTH_BASE_URL", "\"${debugApiBaseUrl.get()}\"")
        }
        release {
            buildConfigField("String", "AUTH_BASE_URL", "\"https://api.nfcompra.esgarpe.dev/\"")
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
    implementation("androidx.compose.material3:material3:1.3.2")

    testImplementation("junit:junit:4.13.2")
}
