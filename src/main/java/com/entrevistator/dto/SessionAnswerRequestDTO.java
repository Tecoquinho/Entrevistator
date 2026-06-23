package com.entrevistator.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SessionAnswerRequestDTO(
        @NotNull Long questionId,
        @NotBlank String selectedAnswer
) {
}
