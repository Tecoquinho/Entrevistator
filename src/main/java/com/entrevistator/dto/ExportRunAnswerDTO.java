package com.entrevistator.dto;

import java.time.LocalDateTime;

public record ExportRunAnswerDTO(
        Long questionId,
        String topic,
        String selectedAnswer,
        boolean correct,
        LocalDateTime answeredAt
) {
}
