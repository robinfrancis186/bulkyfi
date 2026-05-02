export type TemplateAsset = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
  storageKey?: string;
  width: number;
  height: number;
};

export type CustomFont = {
  id: string;
  name: string;
  family: string;
  mimeType: string;
  dataUrl?: string;
  storageKey?: string;
};

export type LogoElement = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl?: string;
  storageKey?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
};

export type CertificateField = {
  id: string;
  label: string;
  placeholder: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: "left" | "center" | "right";
  weight: "400" | "500" | "600" | "700";
};

export type RecipientRow = {
  id: string;
  values: Record<string, string>;
};

export type ColumnMapping = Record<string, string>;

export type ExportSettings = {
  format: "png" | "pdf";
  quality: number;
  maxDimension: number;
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  template?: TemplateAsset;
  customFonts?: CustomFont[];
  logoElements?: LogoElement[];
  fields: CertificateField[];
  rows: RecipientRow[];
  columns: string[];
  mappings: ColumnMapping;
  exportSettings: ExportSettings;
};
