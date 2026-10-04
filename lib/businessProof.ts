// The proof line on /business (brief 18, A7), in words. The counts come
// from db/businessProof.ts; this says only what they support.
export type BusinessProof = { name: string; registered: number; paymentsRecorded: number };

// "Futprep Athletics: 18 children registered and their payments recorded
// on PortPass."
export function proofSentence(proof: BusinessProof): string {
  const children = `${proof.registered} ${proof.registered === 1 ? "child" : "children"} registered`;
  return proof.paymentsRecorded > 0 ? `${proof.name}: ${children} and their payments recorded on PortPass.` : `${proof.name}: ${children} on PortPass.`;
}
