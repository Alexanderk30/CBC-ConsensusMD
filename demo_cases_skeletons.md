# ConsensusMD — Demo Case Skeletons (for review before full build)

**Purpose of this document.** Before I write these as full production cases, read through the four skeletons and confirm (or swap) each one. The skeletons are detailed enough to show you what each case is doing in the demo narrative, but intentionally not yet production-ready — once you sign off, I'll flesh each into a full case with realistic labs, exam findings, published-case attribution, and a held-out ground truth block.

**The demo arc these four cases tell, in order:**

1. Case 1 — **the life-saving catch.** System surfaces a diagnosis a time-pressured clinician would miss. Emotional peak of the demo.
2. Case 2 — **the clean consensus.** System knows when not to second-guess itself. Shows calibration.
3. Case 3 — **the belief update.** A specialist visibly changes its mind under adversarial challenge. Shows the architecture working.
4. Case 4 — **the deadlock.** Genuine ambiguity, system flags for human referral. Shows the signature safety feature.

Each case does one job. Together they tell a four-beat story. Swapping a case means either (a) keeping its role in the arc, or (b) restructuring the arc.

---

## Case 1 — The life-saving catch

**Archetype:** Life-threatening diagnosis masquerading as a benign one.
**Demo role:** Emotional peak. The moment that makes the judge remember the project.
**Pattern source (published analog):** Well-documented clinical pattern — postpartum pulmonary embolism misdiagnosed as postpartum anxiety. Published repeatedly in OBGYN and emergency medicine case literature.

### Skeleton presentation

- **Patient:** 28-year-old woman, G1P1, 18 days postpartum from uncomplicated vaginal delivery
- **Chief complaint:** "I can't catch my breath and I'm scared."
- **HPI:** Over the past 24 hours, progressive shortness of breath with intermittent sharp right-sided chest pain, worse on deep inspiration. No fever, no cough, no hemoptysis. Has been more anxious since delivery; started sertraline 50mg two weeks ago for postpartum anxiety. Sleep has been poor. Reports "my heart feels like it's pounding." Denies leg swelling or pain. Has not been walking much, mostly bedrest with the baby.
- **Past medical history:** Anxiety disorder, well-controlled on sertraline. Otherwise healthy. No prior DVT/PE.
- **Social:** Non-smoker. No drug use. Lives with partner.
- **Family history:** No known thrombophilia. Mother had "blood clots in her legs" in her 50s.
- **Vitals:** HR 112, RR 22, BP 118/74, SpO2 94% on room air, temp 37.2°C
- **Exam:** Anxious-appearing, mildly tachypneic. Lungs clear to auscultation bilaterally. Heart regular, tachycardic, no murmur. Calves without swelling, non-tender. No JVD.
- **Initial workup (provided to the system):** Basic chemistries normal. CBC unremarkable. EKG: sinus tachycardia at 112, no ST changes, no S1Q3T3.

### The diagnostic trap

- **Plausible-but-wrong leading diagnosis a single model is likely to reach first:** Anxiety attack / panic disorder exacerbation. Reasoning: known anxiety history, recent SSRI start, postpartum period emotionally stressful, exam largely benign, EKG shows only tachycardia, oxygen saturation only mildly reduced.
- **Correct diagnosis:** Pulmonary embolism.
- **Why a probabilistic reasoner might miss it:** Anxiety has a much higher base rate than PE. The patient's own framing ("I'm anxious," "I'm scared") biases the reasoning.
- **Why an eliminative reasoner should catch it:** Postpartum state is one of the highest-risk periods for VTE in a woman's life (≈5x non-pregnant baseline). Family history of VTE. Tachycardia + borderline hypoxia + pleuritic chest pain in a high-risk demographic = PE must be ruled out before anxiety is accepted.
- **Distinguishing test:** D-dimer (highly sensitive in this context), CT-PA if positive or clinical suspicion high. Wells score would be ≥4.5 (tachycardia alone + PE as likely or more likely than alternative = 4.5).

### What the architecture should show

- **Round 0:** Probabilistic specialist likely starts with anxiety attack / panic disorder. Mechanistic specialist may also lean that way. Eliminative specialist should flag PE as a cannot-miss.
- **Round 1:** Antagonist challenges the anxiety diagnosis by surfacing the postpartum VTE risk and the SpO2 of 94% ("anxiety does not cause hypoxia").
- **Round 2:** Probabilistic specialist visibly updates its ranking — PE moves up, anxiety moves down. This is the belief-update moment visible on the graph.
- **Round 3:** Antagonist runs out of credible challenges. System converges on PE with D-dimer/CT-PA as next step.
- **Final output:** "Primary diagnosis: pulmonary embolism. Recommended next step: D-dimer; if positive or clinical suspicion high, CT pulmonary angiogram. Differential considered and deprioritized: anxiety attack (does not explain hypoxia or tachycardia of this degree in a high-VTE-risk patient)."

### Why this works in a demo

The narrative arc lands. Every viewer has heard of anxiety and can imagine a clinician dismissing a postpartum woman as anxious. The system's output is viscerally impressive: "this patient's life was plausibly saved." It does not overclaim — you're not saying the system always gets PE right, you're saying *in this case* the architecture's adversarial pressure surfaced a diagnosis the probabilistic frame alone missed.

---

## Case 2 — The clean consensus

**Archetype:** Textbook presentation where the correct answer is unambiguous.
**Demo role:** Show calibration — the system is appropriately confident on easy cases, not paranoid.
**Pattern source:** Standard inferior STEMI presentation, fully textbook.

### Skeleton presentation

- **Patient:** 62-year-old man
- **Chief complaint:** "Crushing chest pain for the past hour."
- **HPI:** Sudden onset of substernal chest pressure radiating to left jaw and left arm, started one hour ago while mowing the lawn. Associated with nausea, one episode of vomiting, profuse diaphoresis. Rates the pain 9/10. Not relieved by rest. No prior similar episodes.
- **Past medical history:** Hypertension (on lisinopril), hyperlipidemia (on atorvastatin), type 2 diabetes (on metformin).
- **Social:** 40 pack-year smoking history, quit last year. Occasional alcohol.
- **Family history:** Father died of MI at age 58. Brother had CABG at 55.
- **Vitals:** HR 98, RR 20, BP 148/92, SpO2 96% on room air, temp 36.8°C
- **Exam:** Diaphoretic, in obvious distress. Lungs clear. Heart regular, no murmur. Extremities without edema.
- **Initial workup (provided to the system):** EKG shows 2-mm ST elevation in leads II, III, aVF with reciprocal depression in I and aVL. Troponin I: pending at time of presentation. CXR unremarkable.

### The (lack of) diagnostic trap

- **Correct diagnosis:** Acute inferior ST-elevation myocardial infarction (STEMI).
- **There is no plausible alternative.** The EKG is diagnostic. The clinical picture is textbook. The risk profile is maximal.
- **Distinguishing test:** Already present — the EKG is the answer. Troponin will confirm.

### What the architecture should show

- **Round 0:** All three specialists converge on inferior STEMI with high confidence.
- **Round 1:** Antagonist attempts challenges — aortic dissection (ruled out by EKG pattern and lack of pulse differential), pericarditis (ruled out by ST pattern — localized inferior with reciprocal changes, not diffuse), esophageal rupture/Boerhaave (no vomiting pattern or subcutaneous emphysema). Each challenge fails rapidly.
- **Round 2:** Antagonist declares `no_credible_challenge`. Debate ends.
- **Final output:** "Primary diagnosis: acute inferior STEMI. Recommended next step: immediate cath lab activation; aspirin, P2Y12 inhibitor, heparin per protocol. No credible alternative diagnosis emerged under adversarial review."

### Why this works in a demo

**This is the most important case in the demo and the most boring.** Without it, every case is a hard case and the system reads as a zebra-detector — a tool that only finds the rare diagnosis. With it, the system reads as *calibrated* — it matches clinician confidence on obvious cases and surfaces uncertainty on ambiguous ones. That's the architectural claim. This case proves it.

**In the demo:** run this case *fast*. The antagonist tries two challenges, both fail, system converges in 2 rounds. Maybe 20 seconds of screen time. The message is: "the system isn't trying to manufacture uncertainty. When the answer is clear, it says so."

---

## Case 3 — The belief update

**Archetype:** Common misdiagnosis pattern where a less-common-but-serious diagnosis is the correct one, and the correction happens under adversarial pressure.
**Demo role:** Show the architecture *working* — a specialist visibly changes its mind during debate.
**Pattern source:** Addison's disease misdiagnosed as depression / chronic fatigue. Published repeatedly in endocrinology literature — the classic "12+ months to diagnosis" pattern.

### Skeleton presentation

- **Patient:** 42-year-old woman
- **Chief complaint:** "I'm exhausted all the time and I almost fainted yesterday."
- **HPI:** 5-month history of progressive fatigue, decreased appetite with 12-lb weight loss, and intermittent nausea. Over the past 6 weeks, increasing dizziness on standing. Yesterday nearly lost consciousness when standing up from a chair. Reports unusual salt cravings ("I've been eating pickles straight from the jar"). Has been seen twice in the past 4 months and told she has depression / possible chronic fatigue syndrome.
- **Past medical history:** Hashimoto's thyroiditis on levothyroxine (well-controlled per recent TSH). Otherwise healthy.
- **Medications:** Levothyroxine 75 mcg daily.
- **Social:** Non-smoker. No drug use. Married, two children. Elementary school teacher — on medical leave for past two weeks due to fatigue.
- **Family history:** Mother has type 1 diabetes. Aunt has "thyroid problems."
- **Vitals:** HR 96 supine / 118 standing; BP 98/62 supine / 82/54 standing; RR 16, SpO2 99% on room air, temp 36.6°C
- **Exam:** Thin, tired-appearing. Skin shows hyperpigmentation of palmar creases, gums, and scar on left knee. Lungs clear. Heart regular, no murmur. Abdomen soft, mildly tender in epigastrium. No edema.
- **Initial workup (provided to the system):** Sodium 128, potassium 5.4, glucose 74, BUN 22, creatinine 0.9. CBC: mild normocytic anemia (Hb 11.2). TSH 2.1 (normal). Morning cortisol: pending.

### The diagnostic trap

- **Plausible-but-wrong leading diagnosis:** Depression with somatic symptoms / chronic fatigue syndrome / functional disorder. This is what her prior clinicians diagnosed. It is the "common" answer.
- **Correct diagnosis:** Primary adrenal insufficiency (Addison's disease). Autoimmune polyglandular syndrome context given her Hashimoto's.
- **Why the mistake is easy to make:** Fatigue + weight loss + mood changes + prior clinician anchoring on depression. Without looking carefully at the vitals and electrolytes, the pattern looks psychiatric.
- **The cannot-miss signals in the case:** Hyperpigmentation of palmar creases and gums (nearly pathognomonic for primary adrenal insufficiency), orthostatic vitals with significant drop, hyponatremia with hyperkalemia, salt craving, existing autoimmune disease (Hashimoto's — classic APS-II pattern).
- **Distinguishing test:** Morning cortisol + ACTH stimulation test. Low cortisol with high ACTH confirms primary adrenal insufficiency.

### What the architecture should show

- **Round 0:**
  - Probabilistic specialist: likely primary diagnosis = depression / chronic fatigue syndrome, with adrenal insufficiency in the differential but low.
  - Mechanistic specialist: may center on a unifying mechanism — the electrolyte pattern plus hyperpigmentation plus orthostasis hints at adrenal, but could also lean toward occult malignancy with paraneoplastic features.
  - Eliminative specialist: flags adrenal crisis as cannot-miss given orthostatic hypotension and electrolyte pattern.
- **Round 1:** Antagonist challenges the depression diagnosis: "depression does not cause hyperkalemia, hyponatremia, or hyperpigmentation of the gums. These are metabolic findings requiring a metabolic explanation."
- **Round 2:** **The probabilistic specialist visibly updates.** Depression moves out of the primary slot; Addison's moves in. Confidence on the probabilistic specialist's node shifts. *This is the visual moment on the graph.*
- **Round 3:** Antagonist tries one more challenge — could this be occult malignancy? — and specialists converge that the hyperpigmentation + electrolyte + autoimmune pattern strongly favors primary adrenal insufficiency with ACTH stim as the confirming test.
- **Final output:** "Primary diagnosis: primary adrenal insufficiency (Addison's disease), likely autoimmune in context of existing Hashimoto's. Recommended next step: morning cortisol and ACTH stimulation test; consider autoimmune polyglandular syndrome type II workup. Residual uncertainty: occult malignancy with paraneoplastic features remains possible but less likely given autoimmune context."

### Why this works in a demo

This is where the architecture earns its keep in the judge's mind. They see a specialist reach an intuitive-but-wrong conclusion. They see the antagonist attack it. They see the specialist *change its mind on screen*. The graph animates a node moving between positions. No voting ensemble does this. No single-model system does this. It is specifically what the adversarial architecture produces.

---

## Case 4 — The deadlock

**Archetype:** A presentation genuinely underdetermined by the available information. The correct system output is "we cannot resolve this without more workup."
**Demo role:** Show that the system fails *gracefully* — deadlock is the signature safety feature.
**Pattern source:** Early multiple sclerosis vs. neuroborreliosis (Lyme disease with neurological involvement) vs. functional neurological disorder. All three can present identically at early stages. Published in neurology literature as a known diagnostic challenge.

### Skeleton presentation

- **Patient:** 34-year-old woman
- **Chief complaint:** "Something is wrong with my nerves and no one can tell me what."
- **HPI:** 4-month history of episodic neurological symptoms:
  - 4 months ago: numbness and tingling in left leg lasting 3 weeks, resolved spontaneously.
  - 2 months ago: brief episode (5 days) of blurred vision in right eye, described as "like looking through wax paper," with some eye pain on movement. Resolved.
  - Ongoing: intermittent fatigue, occasional migratory joint aches (knees, wrists), memory feels "foggy."
  - 2 weeks ago: returned from a 2-week camping trip in upstate New York / Vermont border. Does not recall a tick bite but "we were in the woods constantly." Had one episode of fever and malaise after returning that resolved in 3 days.
- **Past medical history:** Generalized anxiety disorder. Seasonal allergies.
- **Medications:** Escitalopram 10 mg daily.
- **Social:** Non-smoker. Occasional alcohol. Works as a graphic designer, recently stressed about a project deadline.
- **Family history:** Maternal aunt with multiple sclerosis. No family history of Lyme.
- **Vitals:** HR 78, RR 14, BP 118/72, SpO2 99%, temp 36.8°C
- **Exam:** Alert, cooperative. Cranial nerves grossly intact, though patient reports right eye "still feels not quite right." Motor strength 5/5 throughout. Sensation reports mild decreased sensation over left anterior thigh. Reflexes 2+ symmetric. Gait normal. Romberg negative. No meningeal signs. No rash. No joint effusions. No lymphadenopathy.
- **Initial workup (provided to the system):** Basic chemistries normal. CBC normal. TSH normal. ESR mildly elevated (24). B12 normal. Ferritin normal.

### The (lack of) resolution

- **The three genuinely competing diagnoses:**
  1. **Multiple sclerosis (relapsing-remitting).** Supported by: two discrete neurological episodes separated in time and space (optic nerve + spinal cord pattern), family history, age and sex demographics. Needs: MRI brain and spine with contrast, CSF analysis for oligoclonal bands.
  2. **Neuroborreliosis (Lyme disease with CNS involvement).** Supported by: recent exposure in endemic region, post-exposure febrile illness, migratory joint aches, possible cranial neuropathy. Needs: Lyme serology (ELISA → Western blot), CSF analysis if positive.
  3. **Functional neurological disorder with anxiety overlay.** Supported by: anxiety history, current high-stress context, episodic resolving symptoms, largely normal exam. But: optic neuritis with eye pain on movement is not typically functional, and the electrolyte/ESR pattern is real.
- **The correct system output is not a diagnosis.** It is: "This case is genuinely ambiguous with the information available. Three hypotheses are credible. Here are the tests that would distinguish them. Human specialist review is recommended."

### What the architecture should show

- **Round 0:** Specialists split — probabilistic may lean functional/anxiety (highest base rate), eliminative may lean MS (cannot-miss given family history + two episodes), mechanistic may lean Lyme (recent exposure + unifying mechanism for multisystem symptoms).
- **Rounds 1–4:** Antagonist keeps finding credible challenges to each leading diagnosis. Every attempt to converge gets attacked because the data genuinely does not resolve.
- **Round 4:** System hits max rounds without antagonist failing. Consensus agent activates but produces the deadlock output, not a single diagnosis.
- **Final output:** "The system could not converge on a single diagnosis under adversarial review. Three hypotheses remained credible after 4 rounds of debate: (1) multiple sclerosis — distinguished by MRI brain/spine with contrast and CSF oligoclonal bands; (2) neuroborreliosis — distinguished by Lyme serology and CSF if positive; (3) functional neurological disorder — a diagnosis of exclusion after 1 and 2 are ruled out. Recommended next step: neurology referral. This case is flagged for human specialist review."

### Why this works in a demo

**This is the signature moment.** Every other multi-agent AI demo ends with a confident answer. This one ends with a structured "I don't know, here's what a human needs to decide." In a hackathon full of overconfident LLM demos, a project that sometimes says "refer this to a specialist" reads as mature, safety-conscious, and architecturally distinct.

**The graph at the end does not show convergence.** It shows three stable clusters. The visualization itself is novel — the system's disagreement is *information*, rendered visible.

**What to say in the pitch at this moment:** "When the system can't resolve a case under adversarial review, it says so explicitly — and tells the clinician what tests would distinguish the competing hypotheses. For a rural clinician without access to specialists, this is the output they actually need: not a guess, but a structured next step."

---

## Summary — decisions for you

Read through the four skeletons and tell me:

1. **Case 1 (life-saving PE catch):** keep as-is, swap for a different life-threatening catch, or adjust clinical details?
2. **Case 2 (clean STEMI consensus):** keep as-is, swap for a different clean-convergence case, or cut entirely (not recommended — you need this for calibration story)?
3. **Case 3 (Addison's belief update):** keep as-is, swap for a different belief-update case, or adjust?
4. **Case 4 (MS vs. Lyme vs. functional deadlock):** keep as-is, swap for a different deadlock case, or adjust?

**Two specific things to consider while reviewing:**

- **Demographic mix.** Right now the four patients are: 28F (postpartum), 62M (smoker), 42F (autoimmune), 34F (anxiety). If the physician reviewing these flags the skew (3 of 4 female), easy to adjust.
- **Chief complaint diversity.** Chest pain × 2, fatigue × 1, neurological × 1. If you want broader diversity (abdominal, infectious, GI), Case 2 or Case 3 is the slot to swap.

Once you sign off, I'll flesh these into full production cases — complete labs, published-case citations, the held-out ground truth blocks, and the exact text that would be fed into the system at each round.
