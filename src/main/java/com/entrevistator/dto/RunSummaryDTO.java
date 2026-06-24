package com.entrevistator.dto;

import java.time.LocalDateTime;

public record RunSummaryDTO(
        Long runId,
        String mode,
        LocalDateTime startedAt,
        LocalDateTime finishedAt,
        int totalQuestions,
        int answeredQuestions,
        int correctAnswers,
        boolean completed
) {
}
