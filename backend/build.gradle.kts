plugins {
    java
    jacoco
    id("org.springframework.boot") version "3.5.6"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.google.cloud.tools.jib") version "3.4.4"
    id("org.springdoc.openapi-gradle-plugin") version "1.9.0"
    id("org.owasp.dependencycheck") version "10.0.4"
}

group = "com.lunchbox"
version = "0.1.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

val mapstructVersion = "1.6.3"
val shedlockVersion = "5.16.0"
val resilience4jVersion = "2.2.0"
val testcontainersVersion = "1.20.3"

dependencyManagement {
    imports {
        mavenBom("org.testcontainers:testcontainers-bom:$testcontainersVersion")
    }
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("org.springframework.boot:spring-boot-starter-amqp")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    implementation("org.springframework.boot:spring-boot-starter-cache")
    implementation("org.springframework.boot:spring-boot-starter-aop")

    // STOMP broker relay transport (TCP client for RabbitMQ STOMP)
    implementation("io.projectreactor.netty:reactor-netty")

    implementation("org.hibernate.orm:hibernate-spatial")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    runtimeOnly("org.postgresql:postgresql")

    implementation("com.google.firebase:firebase-admin:9.4.1")
    implementation("com.google.ortools:ortools-java:9.11.4210")

    implementation(platform("software.amazon.awssdk:bom:2.28.29"))
    implementation("software.amazon.awssdk:s3")

    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.8.13")
    implementation("io.github.resilience4j:resilience4j-spring-boot3:$resilience4jVersion")
    implementation("net.javacrumbs.shedlock:shedlock-spring:$shedlockVersion")
    implementation("net.javacrumbs.shedlock:shedlock-provider-jdbc-template:$shedlockVersion")

    implementation("io.micrometer:micrometer-registry-prometheus")
    implementation("io.micrometer:micrometer-tracing-bridge-otel")
    implementation("io.opentelemetry:opentelemetry-exporter-otlp")
    implementation("io.sentry:sentry-spring-boot-starter-jakarta:7.16.0")

    implementation("org.mapstruct:mapstruct:$mapstructVersion")
    compileOnly("org.projectlombok:lombok")
    annotationProcessor("org.projectlombok:lombok")
    annotationProcessor("org.mapstruct:mapstruct-processor:$mapstructVersion")
    annotationProcessor("org.projectlombok:lombok-mapstruct-binding:0.2.0")
    annotationProcessor("org.springframework.boot:spring-boot-configuration-processor")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.springframework.boot:spring-boot-testcontainers")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:rabbitmq")
    testImplementation("com.redis:testcontainers-redis:2.2.2")
    testCompileOnly("org.projectlombok:lombok")
    testAnnotationProcessor("org.projectlombok:lombok")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.withType<JavaCompile> {
    options.compilerArgs.addAll(
        listOf(
            "-parameters",
            "-Amapstruct.defaultComponentModel=spring",
            "-Amapstruct.unmappedTargetPolicy=WARN",
        ),
    )
}

tasks.test {
    useJUnitPlatform()
    jvmArgs("-XX:+EnableDynamicAgentLoading")
    systemProperty("updateSnapshot", System.getProperty("updateSnapshot") ?: "false")
    finalizedBy(tasks.jacocoTestReport)
}

tasks.jacocoTestReport {
    dependsOn(tasks.test)
    reports {
        xml.required = true
        html.required = true
    }
}

tasks.jacocoTestCoverageVerification {
    violationRules {
        rule {
            element = "PACKAGE"
            includes = listOf(
                "com.lunchbox.orders",
                "com.lunchbox.dispatch",
                "com.lunchbox.verification",
                "com.lunchbox.payouts",
                "com.lunchbox.subscriptions",
            )
            limit {
                counter = "LINE"
                minimum = "0.80".toBigDecimal()
            }
        }
    }
}

jib {
    from {
        image = "eclipse-temurin:21-jre-jammy"
    }
    to {
        image = (System.getenv("JIB_IMAGE") ?: "lunchbox/backend") + ":" + (System.getenv("IMAGE_TAG") ?: version.toString())
    }
    container {
        ports = listOf("8080")
        user = "1000:1000"
        jvmFlags = listOf(
            "-XX:MaxRAMPercentage=75",
            "-XX:+UseG1GC",
            "-XX:+ExitOnOutOfMemoryError",
            "-Duser.timezone=UTC",
        )
        environment = mapOf("SPRING_PROFILES_ACTIVE" to "prod")
    }
}

openApi {
    apiDocsUrl = "http://localhost:8080/v3/api-docs"
    outputDir = layout.buildDirectory.dir("openapi")
    outputFileName = "openapi.json"
    customBootRun {
        args = listOf("--spring.profiles.active=local")
    }
}

dependencyCheck {
    failBuildOnCVSS = 7.0f
    suppressionFile = "config/dependency-check-suppressions.xml"
    nvd {
        apiKey = System.getenv("NVD_API_KEY") ?: ""
    }
}
