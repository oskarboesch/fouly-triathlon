// Central place to edit event details, links, and course metadata.

const eventConfig = {
  name: "Fouly Triathlon",
  date: "12.09.2026",
  dateLabel: "Date à confirmer",
  location: "Champex-Lac → La Fouly, Valais, Suisse",
  tagline:
    "Un triathlon entre amis, en pleine montagne : natation dans le lac, vélo jusqu'à La Fouly, et course finale dans la vallée.",
};

// `id` must match a key in js/course-data.js (swim / bike / run).
const legs = [
  {
    id: "swim",
    label: "Natation",
    icon: "\u{1F3CA}",
    color: "#2094f3",
    description: "Boucle dans le lac de Champex.",
  },
  {
    id: "bike",
    label: "Vélo",
    icon: "\u{1F6B4}",
    color: "#ff7a29",
    description: "De Champex-Lac à La Fouly, à travers la vallée.",
  },
  {
    id: "run",
    label: "Course",
    icon: "\u{1F3C3}",
    color: "#3fb950",
    description: "Boucle finale à La Fouly.",
  },
];

const whatsappGroups = [
  {
    id: "benevoles",
    label: "Bénévoles",
    icon: "\u{1F64C}",
    description: "Aide à l'organisation, ravitaillement, signalisation.",
    link: "https://chat.whatsapp.com/C4yGRD2V0gC1nErivNetSD?s=cl&p=i&mlu=4",
    qr: "assets/qr/benevoles.jpg",
  },
  {
    id: "solo",
    label: "Solo",
    icon: "\u{1F947}",
    description: "Tu enchaînes les 3 disciplines toi-même.",
    link: "https://chat.whatsapp.com/JmFoMSSCFflG4LlKKsmjUL?s=cl&p=i&mlu=4",
    qr: "assets/qr/solo.jpg",
  },
  {
    id: "relai-nage",
    label: "Relais — Nage",
    icon: "\u{1F3CA}",
    description: "Tu prends en charge la partie natation d'une équipe relais.",
    link: "https://chat.whatsapp.com/GT1Zw74XNqI7dlHWQxIAaR?s=cl&p=i&mlu=4",
    qr: "assets/qr/relai-nage.jpg",
  },
  {
    id: "relai-velo",
    label: "Relais — Vélo",
    icon: "\u{1F6B4}",
    description: "Tu prends en charge la partie vélo d'une équipe relais.",
    link: "https://chat.whatsapp.com/EBH0FY2kvBMDt6mJ5sFyrV?s=cl&p=i&mlu=4",
    qr: "assets/qr/relai-velo.jpg",
  },
  {
    id: "relai-course",
    label: "Relais — Course",
    icon: "\u{1F3C3}",
    description: "Tu prends en charge la partie course d'une équipe relais.",
    link: "https://chat.whatsapp.com/LnjxfzCSWAR4rITP79uwIf?s=cl&p=i&mlu=4",
    qr: "assets/qr/relai-course.jpg",
  },
];
