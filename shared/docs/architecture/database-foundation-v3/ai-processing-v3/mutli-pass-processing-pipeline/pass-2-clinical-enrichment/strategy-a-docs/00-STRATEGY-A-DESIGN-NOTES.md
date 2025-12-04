**Original design Pre-today (2nd Decemeber 2025)**
1. Pass 2 will analyse at most 1 encounter per api call (encounters discovery performed in pass 0.5). 
    - If the encounter is high volume (or the economomics and UX -processing time - indicate it) the encounter will be broken up into inteligently determined batches, primarily based on the identified bridge schema zones. 
    - For a given api call batch, pass 2 will likely receive:
      a. A brief context package that provides context about the encounter within which the batch, and clinical entities, reside.
      b. The enhanced ocr output specific to the batch, containing the text + xy coordinates for each word within the batch
          - xy coordinates (via the enhanced-xy-ocr format) are needed to:
            - Assign bounding boxes to each clinical entity. To reduce token output by 50% the ai need only output 1 y and 1 x. With a post-ai cross-analysis function to find the other two vertices
            - Allow the pass 2 ai model to 'see' the layout of strangely formatted text, such as path result tables with lateral columns. This is the real reason why xy coordinates are needed for pass 2.
      c. The specific bridge scehma to help guide the enrichment process and output requiremnts 
      d. A list of all the pass 1 clinical entities (original text markers) that it must 'enrich'
          - Each clinical entity will come with a shortlist of matched medical codes (~ 10-20 maybe). 
  2. Pass 2 will also have a second side alley system for any non-text blocks identified and labeled within the ocr output data, such as non-text images, graphs etc. 
    - If this second path is triggered by the presence of non-text blocks, then the cropped pixels will be sent to accompany the enhanced xy ocr output within the pass 2 api call, for the given batch. 
    - For now pass 1 does not need to be involved at all in this second side alley non-text block pathway, and hopefully pass 2 can deal with it itself without the prep material that pass 1 provides it. 

End outcome: 
  - Every clinical entity from the uploaded file is extracted labeled and stored inteligently, with all context recorded and preserved, with all clincial entitiy relationships and encoutner-clincial-entity relationship links preserved and utilized come frontend display and user interacation. 
  - The above relationships will be used for pass 3 Narrative generation (future concept). 
  - Future vision: Complety change the way users and doctors view and keep track of healthcare, replacing a document-centric or document-reliant approach to more meaningul narrative approach. Instead of referring to a document or file you refer to the narrative, which only used the file once off to gather and learn the ifnormation to build and bolster the health narrative and sub narratives. 



**New design and new thinking - 2nd december 2025**
Pass 2 indepth planning:
- 2 main conundrums that that need to be solved regarding Pass 2:
    - Consistent medical code assignment, for every entity 
    - Bridge schema guidance for every type of entity
- If we have solutions for the above, then pass 2 should work fine, may just need to titrate batch size and ai model tier to ensure accuracy. 
- Medical code issue:
    - History of the issue: 
    - Oriignally pass 2 was just the "AI call" but we realized medical codes (and bridge schemas) were needed so we split it up into pass 1 and pass 2, with pass 1 preparing everything for pass 2. 
        - Medical codes are needed for dedpulication as temporal data management of sequentialy uploaded and db-inserted clinical entities. 
        - Hence pree-pass2 medical code shortlist prepararation was the original plan. With end goal being that once pass 2 is complete, there is nothing further to do and the info can be inserted into the organizational db. 
        - But, a few issues with that approach, with one being that pass1/1.5 prepared medical code shortlists may explode pass2 input token volumes, or just not be correct and not contain the right code. 
    - Instead, brainstorming other alternative approaches, we could:
        (A) Post-Pass2 Only Approach (Vector-Based / Cache-Only Strategy). 
            - Move medical code assignment to after pass 2. 
            - Pass 2 outputs fully enriched clinical entities but with vacant medical codes. 
                - Pass 2 should output whatever is required of pass 2.5 which may include 'universal aliases' explicitly for fascilitating pass 2.5s job. 
            - Pass 2.5 does medical code assignment via a multi pronged tiered priority approach using High-Confidence Semantic Retrieval (Vector Search):
                - Using enriched clinical entity information provided by powerful thinking pass 2 ai model, the pass 2.5 ai model works in batches of clincial entity types (medication vs conditions vs lab tests etc). 
                - For each condition batch, it receives all pre-existing condition names and corresponding medical codes for that patient 
                - The AI model then determines if each clinical entity in the condition batch already has a corresponding 'perfect' 'primary' match and if so, assigns the same medical code. 
                - If no 'perfect' 'primary' match, it then performs 'secondary' code matching by looking to the exora internal code library, filtered by the condition clincial entity suptype, and selects a medical code only if it is a 'perfect' secondary match (this table takes the same column values and medical codes directly from the universal_medical_codes table, as thats where the table 'buds off' from).
                - If no 'perfect' 'secondary' match, it then performs 'tertiary' code matching by looking to the unviersal medical code libraries filtered by the condition clincial entity suptype (universal_medical_codes table already has this column for all 3 big code libraries), it then finds the best possible 'tertiary' match. 
                - When tertiary matching is required, the chosen medical code is added to the internal code library for future secondary matches. This auto-population ensures consistency: if multiple similar codes exist in the universal code set, the internal library will standardize on the first code selected, so all future matching uses the same code across patients and encounters.
        (B) Split medical code assignment between both pre and post pass 2:
            Pre-pass2
                - Given the other main important job of pass 1 is to prepare the bridge scehmas for pass 2, we could utilize that opportunity to peg on the patient's pre-existing clincial entities that are relevant to each bridge schema. 
                - So, pass 1 identifies the regions of the page / batch / encounter / shell_file where specific bridge scehmas are required.
                - Pass 2 receives specific regions of ocr input along with the relevant bridge schemas to interpret that region. 
                - Bridge scehmas are designed to be tailorable to the patient's pre-existing clinical entities. 
                - For example, the bridge schema for conditions includes a section where the patients condition entities are pulled and uploaded into the bridge schema format for display to the pass 2 ai. 
                - the ai receives the specific region of ocr (containing the ocr coniditon entities in this example) as well as the tailored condition-specific bridge schema (containing the patient's pre-existing condition and corresponding medical codes). The AI can then choose to use pre-existing medical codes during its condition entity extraction, or it can leave it blank if there is no match. 
            - Post-pass2:
                - Pass 2.5 medical code assingment AND verification module occurs after pass 2.
                - For any clinical entity that lacks a medical code it performs the same 3 tiered primary, secondary, tertiary approach as outlined in the "Post-Pass2 Only Approach.". 
                - It also performs verification on pre-pass1 / pass 2 medical code selection, possibly via sending it down the same "Post-Pass2 Only Approach." path, and checking no discrepencies. 
        Aside from some possible verification benefit, not really sure what benefit the option B split pre-pass2 system actually adds compared to option A... Also taking into account that it adds a lot of complexity in terms of (a) having to tailor bridge scehmas etc. and (b) increasing input token volumes that might not even be needed in the majority of occasions (not a reason rule out option B, but worth keeping in mind). 
- Bridge schema issue:
    - Bridge schemas are potentially very dense and token heavy. 
    - Rather than adding every bridge scehmas to every pass2 api call, it would be much smarter if we could be more specific and only provide bridge scehmas when called for. 
    - Reason being pass 2 is probably going to require a top tier expensive ai model due to more reasoning power, and also because its sort of the final determinator of what goes into the db for that patient and subsequently what enters the aptients health profile (permanently). As such, we should try to limit input tokens and input context to both reduce costs but more iportantly to derisk instruction dilution and prevent accruacy degradation.
    - So pass 1's main job is to 'call up' the neccessary bridge schemas for pass 2. But pass 1 could do even more, by going one step further to help split the ocr content into bridge scehma zones or regions, where only a couple, if not one, bridge schemas are provided per pass 2 api call. 
    - This bridge schema zoning capability will also enable and fascilitate increased pass 2 parralelization and thus boost pass 2 processing speed - enhancing the user experience. 
    - The problem is how to ensure that a bridge scehma zone defined by pass 1 does not 'cut out' crucial information pertending to the clinial entities residing within that bridge schena zone. The AI in pass 1 would need. 
        - this part feels tricky, so we need to think about it more broadly and can start off very lax making the zones quite large and overlapping
        - The largest we can make them is obviously the shell_file length itslef.
        - Then, the next largest we would make them is the length of the encounter, which is easy enough to do thanks to pass05 already defining encoutners and their granular start and end y-borders. 
        - The next layer down would be utlizing the intra-encounter 'safe split points' that pass 0.5 is already outputting for encounters longer than 3 pages (configurable). 
            - Utilizing this layer could work quite well as the batch size for this layer (for pass 1 and pass2) would be 3 or so pages (configurable). 
            - For each safe-split point batch, as defined by pass05, pass 1 would have to decide what bridge schemas are needed and thats it, nothing more other than maybe having to justify why. 
            - Pass 1 and Pass 2 to run 1 batch per api call, enabling parralelization and greatly increased processing speed. 
            - each api call receives the encounter context package, so that the safe split point is not stranded out of context. 



What do we actually want to do when a patent uplaods a health file? 
- We want to effortlessly help individuals share thier health story and health data with others, in a succinct, accurate, auditable and secure way. 
- We want to add everything of relevance into the patients healthcare profile. That includes clincial facts about the patient, as well record and document all their healthcare events and touchpoints. 
- We want to extract anything that either the patient themselves or another healthcare provider would need or want to know. 
