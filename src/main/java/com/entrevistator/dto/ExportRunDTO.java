package com.entrevistator.dto;

import java.time.LocalDateTime;
import java.util.List;

public record ExportRunDTO(
        Long runId,
        String mode,
        LocalDateTime startedAt,
        LocalDateTime finishedAt,
        int totalQuestions,
        int answeredQuestions,
        int correctAnswers,
        boolean completed,
        List<ExportRunAnswerDTO> answers
) {
}
