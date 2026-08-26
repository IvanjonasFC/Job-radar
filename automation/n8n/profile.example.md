# Perfil del candidato (plantilla)

Este es el texto que la IA usa para redactar cartas y ajustes de CV **sin inventar nada**.
En los flujos `wf3-acciones.json` y `wf6-ia-ondemand.json` verás un marcador:

```
<<< PON TU PERFIL AQUI: ver automation/n8n/profile.example.md >>>
```

Sustitúyelo por tu perfil real, **un dato por línea** (cada línea es un elemento del array
de strings en el nodo `Code`). Mantén las comillas simples y evita comillas dobles `"` dentro
del texto (romperían el JSON del workflow).

Regla de oro: **todo lo que pongas aquí debe ser cierto y verificable.** La IA solo puede usar
lo que esté en este perfil; si no está, no lo escribirá.

---

## Ejemplo de estructura (rellena con tus datos)

```
== PERFIL ==
[Título/rol] (ej. Técnico Superior en DAM). [Ciudad]. Disponible remoto / híbrido / presencial.
Idiomas: [nivel]. Enlaces: github.com/TU_USUARIO, tu-web.example.com.

EXPERIENCIA:
- [Empresa], [Puesto] ([años]): [responsabilidades y logros con cifras concretas].
- [Empresa], [Puesto] ([años]): [stack y resultados].

PROYECTOS:
- [Proyecto] ([enlace]): [qué es, tecnologías, resultado medible].

STACK: [lenguajes]; [bases de datos]; [frameworks]; [infra/devops]; [otros].

DIFERENCIADORES: [qué te hace distinto en 1-2 frases con sustancia].

LO QUE NO TIENE (sé honesto): [tecnologías o seniority que suelen pedir y aún no dominas].
```

Cuanto más concreto (cifras, nombres de proyecto, resultados), mejores serán las cartas y
menos “relleno” generará la IA.
