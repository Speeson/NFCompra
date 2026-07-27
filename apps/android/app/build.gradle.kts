plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val debugApiBaseUrl = providers.gradleProperty("NFCompraApiBaseUrl")
    .orElse(providers.environmentVariable("NFCOMPRA_API_BASE_URL"))
    .orElse("http://10.0.2.2:8787/")
    .map { if (it.endsWith("/")) it else "$it/" }

android {
    namespace = "dev.esgarpe.nfcompra"
    compileSdk = 36

    defaultConfig {
        applicationId = "dev.esgarpe.nfcompra"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures { buildConfig = true }
    buildTypes {
        debug {
            buildConfigField("String", "AUTH_BASE_URL", "\"${debugApiBaseUrl.get()}\"")
        }
        release {
            buildConfigField("String", "AUTH_BASE_URL", "\"https://example.invalid/\"")
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
    implementation("androidx.compose.material3:material3:1.3.2")
}
