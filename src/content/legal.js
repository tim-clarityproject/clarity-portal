// PLACEHOLDER LEGAL TEXT. The final legal wording for these three
// documents will be written and reviewed before launch. Nothing here
// should be treated as a real or binding legal claim - it exists only
// to give the sign-up flow's reading pop-up real content to scroll and
// read while the actual Terms of Service, Privacy Policy and Data
// Storage Notice are drafted.

const PLACEHOLDER_NOTICE = 'Placeholder text. The final legal wording will be added before launch.';

export const legalDocuments = {
  terms: {
    tabLabel: 'Terms of Service',
    heading: 'Terms of Service',
    paragraphs: [
      PLACEHOLDER_NOTICE,
      'This section will describe the rules for using the Clarity Portal, including account responsibilities, acceptable use, and what happens if these terms are not followed.',
      'It will also cover ownership of the tools and content inside the portal, and the limits of what The Clarity Project can promise about availability or results.',
    ],
  },
  privacy: {
    tabLabel: 'Privacy Policy',
    heading: 'Privacy Policy',
    paragraphs: [
      PLACEHOLDER_NOTICE,
      'This section will explain what personal information is collected when someone uses the Clarity Portal, why it is collected, and how it is used.',
      'It will also describe the choices available for accessing, correcting, or deleting that information, and how to contact The Clarity Project with privacy questions.',
    ],
  },
  dataStorage: {
    tabLabel: 'Data Storage',
    heading: 'Data Storage Notice',
    paragraphs: [
      PLACEHOLDER_NOTICE,
      'This section will explain where account and tool data is stored, which infrastructure provider is used, and how long data is kept.',
      'It will also describe the security measures in place around that storage, and what happens to the data if an account is deleted.',
    ],
  },
};

export const legalDocumentOrder = ['terms', 'privacy', 'dataStorage'];
