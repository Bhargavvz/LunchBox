package com.lunchbox.common.web;

import jakarta.servlet.http.HttpServletResponse;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Function;

/** RFC 4180 CSV writer with formula-injection protection for spreadsheet consumers. */
public final class Csv {

    private Csv() {
    }

    public static <T> void write(HttpServletResponse response, String filename, List<String> headers,
                                 Iterable<T> rows, Function<T, List<?>> mapper) throws IOException {
        response.setContentType("text/csv; charset=utf-8");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader("Content-Disposition", "attachment; filename=\"" + filename.replaceAll("[^A-Za-z0-9._-]", "_") + "\"");
        PrintWriter out = response.getWriter();
        out.write('﻿');
        out.println(String.join(",", headers.stream().map(Csv::escape).toList()));
        for (T row : rows) {
            out.println(String.join(",", mapper.apply(row).stream().map(v -> escape(v == null ? "" : v.toString())).toList()));
        }
        out.flush();
    }

    static String escape(String value) {
        String v = value;
        if (!v.isEmpty() && "=+-@\t\r".indexOf(v.charAt(0)) >= 0) {
            v = "'" + v;
        }
        if (v.contains(",") || v.contains("\"") || v.contains("\n") || v.contains("\r")) {
            v = "\"" + v.replace("\"", "\"\"") + "\"";
        }
        return v;
    }
}
