package com.entrevistator.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record QuestionImportRequestDTO(
        @NotNull List<@Valid QuestionImportItemDTO> questions
) {
}
