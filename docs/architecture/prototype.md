# MVP Prototype Design

**Purpose:** Details the current MVP/prototype: scope, design, limitations, and rationale (1–6 month horizon).
**Last updated:** July 2025
**Audience:** Developers, product managers, contributors
**Prerequisites:** None

---

## Scope

The MVP is focused on validating the core user journey: a user can securely upload a medical document, have it processed, and see the results in a structured format.

**Key Features:**

*   **User Authentication:** Secure sign-up and sign-in using magic links (email OTP).
*   **Document Upload:** A simple and intuitive interface for users to upload PDF and image files of their medical records.
*   **Document Processing:** An asynchronous pipeline that performs basic OCR to extract text from the uploaded documents.
*   **Data Visualization:** A clean, user-friendly dashboard that displays the list of uploaded documents and their processing status.
*   **Secure Storage:** All documents are stored securely in a private Supabase Storage bucket with access restricted to the document owner.

## Design Decisions

*   **Technology Stack:** We are using the stack defined in the [Architecture Overview](./system-design.md) (Next.js, Supabase, Vercel).
*   **Authentication:** Magic links were chosen for their simplicity and security. They reduce the friction of signing up and don't require users to remember a password.
*   **UI/UX:** The user interface is built with Tailwind CSS and shadcn/ui for a clean, modern, and accessible design. The focus is on simplicity and ease of use.
*   **Pipeline:** The initial pipeline is a single, asynchronous step (OCR). This allows us to deliver value quickly while the more complex, multi-agent pipeline is being developed.

## Limitations

The MVP intentionally omits several features that will be part of the long-term vision. These include:

*   **Advanced AI Analysis:** The MVP only performs basic OCR. It does not include features like data extraction, summarization, or trend analysis.
*   **Data Sharing:** Users cannot share their documents with healthcare providers or other users in the MVP.
*   **Multi-language Support:** The MVP only supports English.
*   **Prescription and Appointment Management:** These features are out of scope for the MVP.

## Rationale

The goal of the MVP is to get a functional product into the hands of users as quickly as possible. This allows us to gather feedback, validate our core assumptions, and iterate based on real-world usage. By focusing on a narrow set of features, we can reduce the time to market and ensure a high-quality user experience for the core functionality.

## Next Steps

*   Implement the pluggable `document-processor` endpoint.
*   Conduct user testing with a small group of early adopters.
*   Gather feedback and prioritize features for the next iteration.
 