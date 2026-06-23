package com.entrevistator.dto;

import java.util.List;

public record QuestionResponseDTO(
        Long id,
        String topic,
        String difficulty,
        String questionText,
        List<String> options
) {
}
