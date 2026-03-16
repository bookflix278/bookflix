export function detectCategory(title) {

  const t = title.toLowerCase();

  if (t.includes("amor") || t.includes("romance"))
    return "Romance";

  if (t.includes("historia") || t.includes("história"))
    return "História";

  if (t.includes("python") || t.includes("program"))
    return "Tecnologia";

  if (t.includes("filosof"))
    return "Filosofia";

  if (t.includes("relig"))
    return "Religião";

  if (t.includes("negocio") || t.includes("business"))
    return "Negócios";

  return "Geral";
}