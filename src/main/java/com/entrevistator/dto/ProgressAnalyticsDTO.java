package com.entrevistator.dto;

import java.time.LocalDate;

public record ProgressAnalyticsDTO(
        LocalDate date,
        String topic,
        double accuracy
) {
}
