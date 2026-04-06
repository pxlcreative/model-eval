-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('HARD_STOP', 'WARNING');

-- CreateEnum
CREATE TYPE "RuleKind" AS ENUM ('KEYWORD', 'KEYWORD_WEIGHT_THRESHOLD');

-- CreateEnum
CREATE TYPE "MatchMode" AS ENUM ('ANY', 'ALL');

-- CreateEnum
CREATE TYPE "WeightOp" AS ENUM ('GT', 'GTE', 'LT', 'LTE');

-- CreateEnum
CREATE TYPE "EvalSource" AS ENUM ('UI', 'API');

-- CreateEnum
CREATE TYPE "EvalResult" AS ENUM ('PASS', 'WARN', 'FAIL');

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "rule_kind" "RuleKind" NOT NULL,
    "keywords" TEXT[],
    "match_mode" "MatchMode" NOT NULL DEFAULT 'ANY',
    "weight_op" "WeightOp",
    "weight_pct" DECIMAL(65,30),
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationLog" (
    "id" TEXT NOT NULL,
    "source" "EvalSource" NOT NULL,
    "portfolio_name" TEXT,
    "positions" JSONB NOT NULL,
    "result" "EvalResult" NOT NULL,
    "triggered_rules" JSONB NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Rule_name_key" ON "Rule"("name");
