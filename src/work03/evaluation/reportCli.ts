import { buildWork03StructuralEvaluationReport } from './report'

// Intentionally compact and timestamp-free so identical source and runtime
// contracts produce byte-identical report output.
console.log(JSON.stringify(buildWork03StructuralEvaluationReport()))
