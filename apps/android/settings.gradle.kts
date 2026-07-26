pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
    resolutionStrategy {
        eachPlugin {
            when (requested.id.id) {
                "com.android.application", "com.android.library" ->
                    useModule("com.android.tools.build:gradle:${requested.version ?: "8.13.2"}")
                "org.jetbrains.kotlin.android", "org.jetbrains.kotlin.plugin.compose" ->
                    useModule("org.jetbrains.kotlin:kotlin-gradle-plugin:${requested.version ?: "2.0.21"}")
            }
        }
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "NFCompra"
include(":app", ":core:designsystem", ":feature:shoppinglist")
