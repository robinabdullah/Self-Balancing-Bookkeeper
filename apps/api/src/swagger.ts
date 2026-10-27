import { ApiBody, type ApiBodyOptions } from "@nestjs/swagger";
import { z } from "zod";

// N-2.1: Swagger (dev only) documents a write body from the Zod schema the runner validates it
// with (zod 4's OpenAPI 3.0 output). There is no global ZodValidationPipe: write bodies go to the
// runner's own Zod step and its error shape (design rule 2).
export const ZodBody = (schema: z.ZodType) =>
  ApiBody({
    schema: z.toJSONSchema(schema, { target: "openapi-3.0", io: "input" }),
  } as ApiBodyOptions);
