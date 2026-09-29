# How to remove your client's name from a contract before you use ChatGPT

Source: https://simpler.legal/remove-client-names-before-chatgpt

Page description: Swap each name and ID number for a placeholder like [Party A] in Word, then paste only the clauses into a Temporary chat. With Singapore's rules.

Work on a copy in Word: accept all tracked changes, then use the Replace box (Ctrl+H) to swap every name, ID number, address and account number for a placeholder such as [Party A], the kind Singapore's Ministry of Law (MinLaw) suggests. Even without names, the facts of a deal can point to your client, so read the result once more and paste only the clauses you need, as plain text and not the file, into a Temporary chat in ChatGPT.

Not legal advice.

## What should you take out of the contract?

- **Names:** every party and its short forms, signatories, witnesses, and anyone in the notices clause.
- **Numbers:** NRIC, FIN, passport, UEN, phone, bank account and your matter reference. Singapore's Personal Data Protection Commission (PDPC) says a partial NRIC can still be personal data, so replace the whole number.
- **Addresses and emails,** including the address of a property the deal is about.
- **The letterhead, logo and file name.**
- **Details that identify only together,** which the PDPC calls indirect identifiers. In a contract: an unusual amount, a date and a place. Where the AI does not need the exact figure, replace it too, as MinLaw's [Amount X] example does.

## How do you remove client names in Word on Windows?

1. **Save a copy** (File > Save As) and work only on it.
2. **Accept all tracked changes and stop tracking:** Review > Accept > Accept All Changes and Stop Tracking. Otherwise each name you replace stays in the file as a tracked deletion. The No Markup view only hides changes.
3. **Write your key** in a separate file on your own computer. Give each party its own placeholder, such as [Party A] or its role, like [Purchaser], so the AI can tell them apart. MinLaw suggests recording your placeholders, and the PDPC says a table mapping pseudonyms back to people should be kept securely. Never paste the key.
4. **Replace each name:** press Ctrl+H, type the name in Find what and its placeholder in Replace with. Under More, tick Find whole words only, so a short name is not changed inside a longer word. Click Find Next, then Replace, one at a time. Don't use Replace All: it also changes words you didn't mean. Repeat for the surname alone, initials and every number.
5. **Catch the numbers you never typed:** tick Use wildcards and search for `[STFGM][0-9]{7}[A-Z]` for NRIC and FIN numbers, then `[3689][0-9]{7}` for Singapore phone numbers, which have eight digits and start with 3, 6, 8 or 9 ([IMDA](https://www.imda.gov.sg/-/media/imda/files/regulation-licensing-and-consultations/frameworks-and-policies/numbering/national-numbering-plan-and-allocation-process/imda-national-numbering-plan.pdf)). Replace each one you find, then untick Use wildcards.
6. **Check by eye:** headers, footers, footnotes, text boxes, schedules and the signature page, for a name spelled another way.
7. **Move to plain text:** copy the clauses you need into Notepad, then clear the formatting (the Edit menu or the formatting toolbar), or turn formatting off in Notepad's settings first. A link can hide an email address behind its text ([Microsoft](https://blogs.windows.com/windows-insider/2025/05/30/text-formatting-in-notepad-begin-rolling-out-to-windows-insiders/)). The [ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/security/disclosing-documents-to-the-public-securely/how-do-we-avoid-an-accidental-breach-when-redacting-information/), the UK's information rights regulator, says converting to plain text removes any information that is not displayed. Search the text for every name and number on your key.
8. **Send less:** MinLaw suggests isolated clauses instead of full documents, and questions framed as hypotheticals.

**If you must upload the file itself,** run Document Inspector on your copy first: File > Info > Check for Issues > Inspect Document, select Inspect, then Remove All for comments and revisions and for document properties, which hold the author and the last person to save the file. It cannot find text hidden in other ways, such as white text on a white background.

## What if the contract is a PDF?

Black boxes do not remove names. The ICO notes that text under a black rectangle stays in the file and may be revealed by pasting it into Notepad. Work from the Word version, or copy the clauses into plain text and clean them there. If the PDF is a scan, its words may be stored as an image, so type out what you need.

## Which ChatGPT settings keep the chat out of training?

- **Use a Temporary chat:** open a new chat and select Temporary. OpenAI says a temporary chat is not used to improve its models while it remains temporary, and that it may keep a copy for up to 30 days for safety purposes. Don't save it: once saved, your model-improvement setting applies.
- **Or at least turn training off:** account menu > Settings > Data controls > Improve the model for everyone, off. OpenAI says new conversations then won't be used to train its models, though they can still appear in your chat history.
- **Don't rate the answer.** OpenAI [says](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt) that if you give a thumbs up or down, the whole conversation may be used to train its models, even after you turn training off.
- **Check again later.** On free tools, MinLaw's guide says to turn off both data retention and model training, and to check regularly, because updates may reset the settings. It notes that data may be kept for a while even so.

## What do Singapore's rules and guides say about using ChatGPT?

- **Rule 6** of the [Legal Profession (Professional Conduct) Rules 2015](https://sso.agc.gov.sg/SL/LPA1966-S706-2015): you must not knowingly disclose information that is confidential to your client and that you acquired in the course of the engagement, unless an exception applies, such as the client authorising the disclosure.
- **MinLaw's [Guide for Using Generative AI in the Legal Sector](https://www.mlaw.gov.sg/files/Guide_for_using_Generative_AI_in_the_Legal_Sector__Published_on_6_Mar_2026_.pdf)** (6 March 2026, non-binding) says rule 6 does not prohibit GenAI "provided that appropriate safeguards are implemented". On free tools, it says to avoid confidential information and, if necessary, to use generic placeholders such as [Party A], [Company B] and [Amount X]. For confidential client data, it says to prefer enterprise-level tools.
- **If the contract is part of a court case,** the Singapore Courts' [guide for court users](https://www.judiciary.gov.sg/docs/default-source/news-and-resources-docs/guide-on-the-use-of-generative-ai-tools-by-court-users.pdf?sfvrsn=3900c814_1) says anything you give a GenAI chatbot may potentially be disclosed publicly, and a document you obtained through a court order for production is for those proceedings only.
- **The Personal Data Protection Act (PDPA)** covers personal data: data about an individual who can be identified. Rule 6 is not limited to personal data, so a company client's name and UEN need the same care.

## Is the contract anonymous once the names are gone?

Not necessarily. Removing names is what the PDPC calls de-identification, which it does not treat as anonymisation: de-identified data may be easily re-identified when combined with data that is publicly or easily accessible. MinLaw adds that anonymised content may still be identifiable with enough context, so a known deal or an unusual price can still point to your client. It also says to consider telling clients you use GenAI, especially when you use it substantially, for example to review contracts, or when a tool's data handling may clash with their preferences or data residency requirements. If in doubt, rule 6 allows a disclosure your client authorises, so ask.

## Is there a free app that swaps the names for you?

Simpler Legal is free, with no account, and does the redaction on your own Windows computer: it never uploads, because there is nowhere to upload to. It reads PDF, Word (.docx) and plain text, swaps people's names and identifiers for tags such as [Person1], and lists everything it found in one table for you to check. The key that maps tags back to names exports separately, only if you ask. Dates, amounts, business facts and most places stay readable on purpose, and by default so do company names that are not the document's own. Tags follow spellings, not people, so read the copy before you send it. It does not read scanned pages yet. Version 0.1.0 is not code-signed, so Windows SmartScreen will warn, and you download the 3.35 GB model yourself.

How well it does, measured: [simpler.legal/research](https://simpler.legal/research).

Not legal advice.

## Sources

- Legal Profession (Professional Conduct) Rules 2015, rule 6: [Singapore Statutes Online](https://sso.agc.gov.sg/SL/LPA1966-S706-2015)
- Ministry of Law: [Guide for Using Generative AI in the Legal Sector](https://www.mlaw.gov.sg/files/Guide_for_using_Generative_AI_in_the_Legal_Sector__Published_on_6_Mar_2026_.pdf)
- Singapore Courts: [Guide on the Use of Generative AI Tools by Court Users](https://www.judiciary.gov.sg/docs/default-source/news-and-resources-docs/guide-on-the-use-of-generative-ai-tools-by-court-users.pdf?sfvrsn=3900c814_1)
- PDPC: [Key Concepts in the PDPA](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/ag-on-key-concepts/advisory-guidelines-on-key-concepts-in-the-pdpa-17-may-2022.pdf), [Selected Topics](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/ag-on-selected-topics/advisory-guidelines-on-the-pdpa-for-selected-topics-(revised-may-2024).pdf), [Guide to Basic Anonymisation](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/guide-to-basic-anonymisation-(updated-24-july-2024).pdf), [NRIC Numbers](https://www.pdpc.gov.sg/-/media/files/pdpc/pdf-files/advisory-guidelines/advisory-guidelines-for-nric-numbers---310818.pdf)
- Microsoft: [Keyboard shortcuts in Word](https://support.microsoft.com/en-us/office/keyboard-shortcuts-in-word-95ef89dd-7142-4b50-afb2-f762f663ceb2), [Replace text](https://support.microsoft.com/en-us/word/replace-text), [Find and replace text](https://support.microsoft.com/en-us/word/training/find-and-replace-text-in-word), [Accept or reject tracked changes](https://support.microsoft.com/en-us/word/accept-or-reject-tracked-changes-in-word), [Document Inspector](https://support.microsoft.com/en-us/office/remove-hidden-data-and-personal-information-by-inspecting-documents-presentations-or-workbooks-356b7b5d-77af-44fe-a07f-9aa4d085966f)
- ICO: [Avoiding an accidental breach when redacting](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/security/disclosing-documents-to-the-public-securely/how-do-we-avoid-an-accidental-breach-when-redacting-information/)
- OpenAI: [Temporary chat](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt), [Data controls](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt)
- Microsoft: [Text formatting in Notepad](https://blogs.windows.com/windows-insider/2025/05/30/text-formatting-in-notepad-begin-rolling-out-to-windows-insiders/)
- IMDA: [National Numbering Plan](https://www.imda.gov.sg/-/media/imda/files/regulation-licensing-and-consultations/frameworks-and-policies/numbering/national-numbering-plan-and-allocation-process/imda-national-numbering-plan.pdf)

Sources checked on 29 September 2026.
