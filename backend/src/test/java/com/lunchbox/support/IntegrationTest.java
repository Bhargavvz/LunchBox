package com.lunchbox.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.redis.testcontainers.RedisContainer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;


/**
 * Boots the full application against real Postgres+PostGIS, Redis and RabbitMQ (with STOMP) in containers.
 * Containers are started once per JVM and shared by all integration tests.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestBeans.class)
public abstract class IntegrationTest {

    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:16-3.4").asCompatibleSubstituteFor("postgres"));

    @ServiceConnection
    static final RedisContainer REDIS = new RedisContainer(DockerImageName.parse("redis:7.4-alpine"));

    @ServiceConnection
    static final RabbitMQContainer RABBIT = new RabbitMQContainer(DockerImageName.parse("rabbitmq:3.13-management"))
            .withCopyFileToContainer(MountableFile.forClasspathResource("rabbitmq/enabled_plugins"),
                    "/etc/rabbitmq/enabled_plugins");

    static {
        RABBIT.addExposedPort(61613);
        POSTGRES.start();
        REDIS.start();
        RABBIT.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("lunchbox.replica.url", POSTGRES::getJdbcUrl);
        registry.add("lunchbox.replica.username", POSTGRES::getUsername);
        registry.add("lunchbox.replica.password", POSTGRES::getPassword);
        registry.add("lunchbox.stomp.relay-host", RABBIT::getHost);
        registry.add("lunchbox.stomp.relay-port", () -> RABBIT.getMappedPort(61613));
        registry.add("lunchbox.stomp.client-login", RABBIT::getAdminUsername);
        registry.add("lunchbox.stomp.client-passcode", RABBIT::getAdminPassword);
        registry.add("lunchbox.stomp.system-login", RABBIT::getAdminUsername);
        registry.add("lunchbox.stomp.system-passcode", RABBIT::getAdminPassword);
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    @Autowired
    protected MutableClock clock;

    protected JsonNode call(MockHttpServletRequestBuilder request, String token, Object body, int expectedStatus)
            throws Exception {
        request.header("Authorization", "Bearer " + token).accept(MediaType.APPLICATION_JSON);
        if (body != null) {
            request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
        }
        MvcResult result = mvc.perform(request).andReturn();
        int status = result.getResponse().getStatus();
        String content = result.getResponse().getContentAsString();
        if (status != expectedStatus) {
            throw new AssertionError("Expected HTTP " + expectedStatus + " but got " + status + ": " + content);
        }
        return content.isBlank() ? json.nullNode() : json.readTree(content);
    }

    protected JsonNode get200(String url, String token) throws Exception {
        return call(MockMvcRequestBuilders.get(url), token, null, 200);
    }

    protected JsonNode post(String url, String token, Object body, int status) throws Exception {
        return call(MockMvcRequestBuilders.post(url), token, body, status);
    }

    protected JsonNode put(String url, String token, Object body, int status) throws Exception {
        return call(MockMvcRequestBuilders.put(url), token, body, status);
    }

    protected JsonNode delete(String url, String token, int status) throws Exception {
        return call(MockMvcRequestBuilders.delete(url), token, null, status);
    }
}
