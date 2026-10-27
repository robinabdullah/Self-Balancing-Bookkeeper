import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import { tap } from "rxjs";
import type { Result } from "@mbl/domain/result";

const STATUS: Record<Result["status"], number> = {
  ok: 200,
  duplicate: 409,
  conflict: 409,
  invalid: 422,
};

// N-2.5 (design rule 2): a write answers with its `Result` as the body; the status says which
// kind, so web's `write()` can tell a saved/refused write (200/409/422) from a failure (anything
// else, "Not saved — tap Save again").
@Injectable()
export class ResultStatus implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const res = ctx.switchToHttp().getResponse<Response>();
    return next.handle().pipe(tap((r: Result) => res.status(STATUS[r.status])));
  }
}
