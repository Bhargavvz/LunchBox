package com.lunchbox.common.web;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public final class Pagination {

    public static final int MAX_PAGE_SIZE = 200;

    private Pagination() {
    }

    public static Pageable of(Integer page, Integer size, Sort sort) {
        int p = page == null || page < 0 ? 0 : page;
        int s = size == null || size <= 0 ? 25 : Math.min(size, MAX_PAGE_SIZE);
        return PageRequest.of(p, s, sort);
    }
}
