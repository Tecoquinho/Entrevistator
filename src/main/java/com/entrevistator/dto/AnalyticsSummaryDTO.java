package com.entrevistator.dto;

public record AnalyticsSummaryDTO(
        double completionRate,
        long totalSessions,
        long completedSessions,
        RunSummaryDTO lastSessionResult
) {
}
