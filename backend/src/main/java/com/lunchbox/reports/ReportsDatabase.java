package com.lunchbox.reports;

import com.lunchbox.common.config.LunchBoxProperties;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.annotation.PreDestroy;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Connection pool to the RDS read replica. Deliberately not exposed as a DataSource bean so it can never be picked up
 * by JPA/Flyway or by accident for writes; the connections are also set read-only.
 */
@Component
public class ReportsDatabase {

    private final HikariDataSource dataSource;
    private final NamedParameterJdbcTemplate jdbc;

    public ReportsDatabase(LunchBoxProperties properties) {
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(properties.replica().url());
        config.setUsername(properties.replica().username());
        config.setPassword(properties.replica().password());
        config.setReadOnly(true);
        config.setMaximumPoolSize(8);
        config.setMinimumIdle(1);
        config.setPoolName("reports-replica");
        config.setConnectionTimeout(5000);
        config.setInitializationFailTimeout(-1);
        config.addDataSourceProperty("options", "-c statement_timeout=30000");
        this.dataSource = new HikariDataSource(config);
        this.jdbc = new NamedParameterJdbcTemplate(dataSource);
    }

    public NamedParameterJdbcTemplate jdbc() {
        return jdbc;
    }

    @PreDestroy
    void close() {
        dataSource.close();
    }
}
