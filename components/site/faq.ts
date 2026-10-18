export const siteFaq = [
  {
    question: "What is SOVERYN?",
    answer:
      "A persistent multiplayer sandbox on a real-world map. You play one character, from a real starting city, in a world that continues while you are away.",
  },
  {
    question: "Is the beta open?",
    answer:
      "Yes. Create an account with an email and a password, and accept the terms. There is no invitation list and no email check. Player progression will be wiped after beta.",
  },
  {
    question: "What happens after I register?",
    answer:
      "You create one character: a username, an open starting city, and a specialization. That leads to the command center.",
  },
  {
    question: "Does progress stay?",
    answer:
      "During the beta, character, ledger, and world records stay on the server. Player progression will be wiped after beta.",
  },
  {
    question: "What can I do now?",
    answer:
      "Work, travel, trade, practice skills, take missions, join or found an organization, and take part in fictional politics. Warfare and territorial conquest are not in this version.",
  },
  {
    question: "How do I sign in?",
    answer: "Use the email and password from registration. There is no password reset on this site.",
  },
  {
    question: "Is Discord available yet?",
    answer: "Not yet. The community section marks Discord as coming soon. This site does not publish an invite.",
  },
  {
    question: "Where do I get help?",
    answer:
      "The terms and privacy notice explains what the account stores. There is no separate support desk and no password reset on this site.",
  },
] as const;

export function faqJsonLd(items: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
