package com.entrevistator.dto;

import java.util.List;

public record QuestionImportItemDTO(
        Long id,
        String topic,
        String difficulty,
        String questionText,
        String question,
        List<String> options,
        String correctAnswer,
        String explanation
) {
}
