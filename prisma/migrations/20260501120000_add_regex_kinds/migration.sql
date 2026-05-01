-- Postgres requires ALTER TYPE ... ADD VALUE to run outside any transaction
-- block, so each statement is committed individually by the migration runner.

ALTER TYPE "RuleKind" ADD VALUE 'REGEX';
ALTER TYPE "RuleKind" ADD VALUE 'REGEX_WEIGHT_THRESHOLD';
