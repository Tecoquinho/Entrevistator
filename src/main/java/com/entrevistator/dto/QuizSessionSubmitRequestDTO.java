package com.entrevistator.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record QuizSessionSubmitRequestDTO(
        @NotNull Long runId,
        @NotEmpty List<@Valid SessionAnswerRequestDTO> answers
) {
}
