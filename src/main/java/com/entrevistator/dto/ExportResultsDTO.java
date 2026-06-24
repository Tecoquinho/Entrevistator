package com.entrevistator.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ExportResultsDTO(
        LocalDateTime generatedAt,
        AnalyticsSummaryDTO summary,
        List<ExportRunDTO> recentRuns,
        List<TopicAnalyticsDTO> topicAccuracy,
        List<TopicAnalyticsDTO> weakTopics
) {
}
