export type TemplateAsset = {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  width: number;
  height: number;
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
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  template?: TemplateAsset;
  fields: CertificateField[];
  rows: RecipientRow[];
  columns: string[];
  mappings: ColumnMapping;
  exportSettings: ExportSettings;
};
