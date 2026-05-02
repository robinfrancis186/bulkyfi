import type { CertificateField, Project } from "./types";

const STORAGE_KEY = "easycertify.local.projects.v1";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const nowIso = () => new Date().toISOString();

export const createDefaultFields = (): CertificateField[] => [
  {
    id: uid(),
    label: "Recipient Name",
    placeholder: "name",
    x: 22,
    y: 43,
    width: 56,
    height: 9,
    fontFamily: "Cormorant Garamond",
    fontSize: 48,
    color: "#1a1612",
    align: "center",
    weight: "700"
  },
  {
    id: uid(),
    label: "Course",
    placeholder: "course",
    x: 28,
    y: 58,
    width: 44,
    height: 6,
    fontFamily: "Inter",
    fontSize: 20,
    color: "#7d6f55",
    align: "center",
    weight: "500"
  },
  {
    id: uid(),
    label: "Date",
    placeholder: "date",
    x: 18,
    y: 78,
    width: 22,
    height: 5,
    fontFamily: "Inter",
    fontSize: 16,
    color: "#5f5443",
    align: "center",
    weight: "500"
  }
];

export const createProject = (name = "Untitled Certificate"): Project => {
  const timestamp = nowIso();
  return {
    id: uid(),
    name,
    createdAt: timestamp,
    updatedAt: timestamp,
    fields: createDefaultFields(),
    rows: [
      {
        id: uid(),
        values: {
          name: "A. Smith",
          course: "Advanced Product Operations",
          date: new Date().toLocaleDateString()
        }
      }
    ],
    columns: ["name", "course", "date"],
    mappings: {
      name: "name",
      course: "course",
      date: "date"
    },
    exportSettings: {
      format: "pdf",
      quality: 1.5,
      maxDimension: 2400
    }
  };
};

const normalizeProject = (project: Project): Project => ({
  ...project,
  exportSettings: {
    ...project.exportSettings,
    maxDimension: project.exportSettings.maxDimension ?? 2400
  },
  template: project.template
    ? {
        ...project.template,
        storageKey: project.template.storageKey || project.template.id
      }
    : undefined
});

const projectForStorage = (project: Project): Project => ({
  ...project,
  template: project.template
    ? {
        ...project.template,
        dataUrl: undefined,
        storageKey: project.template.storageKey || project.template.id
      }
    : undefined
});

export const loadProjects = (): Project[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const projects = JSON.parse(raw) as Project[];
    return Array.isArray(projects) ? projects.map(normalizeProject) : [];
  } catch {
    return [];
  }
};

export const saveProjects = (projects: Project[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.map(projectForStorage)));
};
