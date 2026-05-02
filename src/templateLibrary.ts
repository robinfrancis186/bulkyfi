import template1 from "./assets/templates/template-1.png";
import template2 from "./assets/templates/template-2.png";
import template3 from "./assets/templates/template-3.png";
import template4 from "./assets/templates/template-4.png";
import template5 from "./assets/templates/template-5.png";
import template6 from "./assets/templates/template-6.png";
import template7 from "./assets/templates/template-7.png";

export type BuiltInTemplate = {
  id: string;
  name: string;
  description: string;
  url: string;
};

export const builtInTemplates: BuiltInTemplate[] = [
  {
    id: "blue-corners",
    name: "Blue Corners",
    description: "Clean paper with blue corner blocks",
    url: template1
  },
  {
    id: "warm-frame",
    name: "Warm Frame",
    description: "Simple red-orange border",
    url: template2
  },
  {
    id: "heritage-strip",
    name: "Heritage Strip",
    description: "Patterned vertical accent",
    url: template3
  },
  {
    id: "purple-appreciation",
    name: "Purple Appreciation",
    description: "Formal appreciation layout",
    url: template4
  },
  {
    id: "blue-waves",
    name: "Blue Waves",
    description: "Soft blue side curves",
    url: template5
  },
  {
    id: "navy-ribbon",
    name: "Navy Ribbon",
    description: "Structured ribbon frame",
    url: template6
  },
  {
    id: "navy-column",
    name: "Navy Column",
    description: "Minimal right-side column",
    url: template7
  }
];
