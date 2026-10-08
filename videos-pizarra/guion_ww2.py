"""Guion: ¿Cómo fue la Segunda Guerra Mundial? (≈2,5 min)"""
from pizarra import *  # noqa: F401,F403


def title(s, color=INK):
    return [text(640, 70, s, size=58, color=color)]


SCENES = [
    {   # 1. Portada
        "narration": "La Segunda Guerra Mundial fue el conflicto más grande y más mortífero de la historia. "
                     "Duró seis años, de 1939 a 1945, y afectó a casi todo el planeta.",
        "ops": title("La Segunda Guerra Mundial")
        + [text(640, 140, "1939 - 1945", size=48, color=RED)]
        + globe(640, 420, 180)
        + line((420, 180), (860, 180), color=RED, width=4),
    },
    {   # 2. Causas
        "narration": "¿Por qué empezó? Tras la Primera Guerra Mundial, Alemania quedó humillada por el Tratado de Versalles. "
                     "La crisis económica de 1929 trajo pobreza y paro. Y en ese clima llegaron al poder regímenes totalitarios: "
                     "Hitler en Alemania, Mussolini en Italia y un gobierno militarista en Japón.",
        "ops": title("¿Por qué empezó?")
        + document(140, 220) + [text(215, 460, "Versalles", size=38)]
        + chart_down(530, 230) + [text(630, 460, "Crisis 1929", size=38, color=RED)]
        + podium(1050, 330) + [text(1050, 460, "Dictaduras", size=38)]
        + [text(640, 560, "Humillación  +  pobreza  +  totalitarismo", size=40, color=BLUE)]
        + arrow((640, 600), (640, 680), color=RED, width=6),
    },
    {   # 3. Bandos
        "narration": "Se formaron dos bandos. Por un lado, el Eje: Alemania, Italia y Japón. "
                     "Por otro, los Aliados: Reino Unido y Francia, a los que más tarde se unieron la Unión Soviética y Estados Unidos.",
        "ops": title("Dos bandos")
        + line((640, 130), (640, 660), width=4, color=GRAY)
        + [text(320, 170, "EL EJE", size=54, color=RED)]
        + flag(250, 220, fill=RED)
        + [text(320, 440, "Alemania", size=40), text(320, 500, "Italia", size=40), text(320, 560, "Japón", size=40)]
        + [text(960, 170, "LOS ALIADOS", size=54, color=BLUE)]
        + flag(890, 220, fill=BLUE)
        + [text(960, 440, "Reino Unido", size=40), text(960, 500, "Francia", size=40),
           text(960, 560, "URSS  (1941)", size=40), text(960, 620, "EE. UU.  (1941)", size=40)],
    },
    {   # 4. Inicio
        "narration": "El uno de septiembre de 1939, Alemania invadió Polonia. "
                     "Dos días después, Francia y Reino Unido le declararon la guerra. Había comenzado la Segunda Guerra Mundial.",
        "ops": title("Empieza la guerra")
        + calendar(90, 200, "1939", color=RED)
        + [text(165, 385, "1 de septiembre", size=30, color=GRAY)]
        + blob(560, 400, 150, 130, seed=21) + [text(560, 400, "Alemania", size=42)]
        + blob(960, 380, 140, 110, seed=22) + [text(960, 380, "Polonia", size=42)]
        + arrow((640, 330), (880, 330), bend=-40, color=RED, width=8)
        + arrow((660, 470), (880, 450), bend=30, color=RED, width=8)
        + [text(640, 620, "Francia y Reino Unido declaran la guerra", size=40, color=BLUE)],
    },
    {   # 5. Blitzkrieg
        "narration": "Con la guerra relámpago, rápidos ataques de tanques y aviones, Alemania conquistó en pocos meses gran parte de Europa, "
                     "incluida Francia, en 1940. El Reino Unido resistió casi en solitario los bombardeos alemanes.",
        "ops": title("La guerra relámpago")
        + plane(760, 200, 1.1)
        + tank(220, 430, 1.2)
        + lightning(640, 330) + lightning(1120, 190)
        + line((120, 520), (1180, 520), width=5)
        + [text(320, 600, "1940: cae Francia", size=44, color=RED),
           text(940, 600, "Reino Unido resiste", size=44, color=BLUE)],
    },
    {   # 6. 1941
        "narration": "En 1941 todo cambió. Hitler invadió la Unión Soviética, donde el frío y la inmensidad del país frenaron su avance. "
                     "Y en diciembre, Japón atacó por sorpresa la base estadounidense de Pearl Harbor. Estados Unidos entró en la guerra.",
        "ops": title("1941: el año clave")
        + line((640, 130), (640, 660), width=4, color=GRAY)
        + blob(200, 360, 90, 80, seed=31) + [text(200, 360, "Alemania", size=30)]
        + arrow((300, 350), (440, 350), color=RED, width=7)
        + blob(520, 350, 90, 120, seed=32) + [text(520, 350, "URSS", size=38)]
        + snowflake(470, 220, 30) + snowflake(570, 210, 24) + snowflake(560, 500, 26)
        + [text(330, 600, "Invasión de la URSS", size=40, color=RED)]
        + plane(760, 230, 0.8, color=RED)
        + arrow((950, 270), (980, 360), color=RED, width=5, head=16)
        + waves(700, 470, 520) + ship(800, 400, 1.0)
        + [text(960, 600, "Pearl Harbor", size=44, color=BLUE)],
    },
    {   # 7. Holocausto
        "narration": "Mientras tanto, el régimen nazi llevó a cabo el Holocausto: el asesinato sistemático de unos seis millones de judíos, "
                     "además de gitanos, personas con discapacidad, homosexuales y opositores políticos. Nunca debe olvidarse.",
        "ops": title("El Holocausto")
        + candle(330, 300)
        + [text(860, 300, "6 millones", size=80, color=RED),
           text(860, 390, "de judíos asesinados", size=46),
           text(860, 470, "+ gitanos, discapacitados,", size=36, color=GRAY),
           text(860, 515, "homosexuales, opositores...", size=36, color=GRAY),
           text(860, 620, "Nunca más", size=54, color=BLUE)],
    },
    {   # 8. Giro
        "narration": "La guerra giró a favor de los Aliados. Los soviéticos vencieron en la batalla de Stalingrado, en 1943. "
                     "Y el seis de junio de 1944, el Día D, miles de soldados aliados desembarcaron en las playas de Normandía.",
        "ops": title("La guerra cambia de rumbo")
        + ruins(140, 430) + snowflake(200, 200, 26) + snowflake(330, 230, 20)
        + [text(270, 520, "Stalingrado 1943", size=42, color=RED)]
        + waves(680, 430, 330) + boat(700, 395) + boat(860, 405, 0.9)
        + [stroke([(1010, 430), (1060, 400), (1200, 395)], width=5)]
        + flag(1110, 230, w=80, h=55, fill=BLUE)
        + [text(950, 520, "Normandía 1944", size=42, color=BLUE)]
        + arrow((420, 610), (860, 610), color=GREEN, width=7)
        + [text(640, 660, "Avanzan los Aliados", size=36, color=GREEN)],
    },
    {   # 9. Final
        "narration": "En mayo de 1945, los soviéticos tomaron Berlín y Alemania se rindió. Hitler se había suicidado días antes. "
                     "En agosto, Estados Unidos lanzó dos bombas atómicas sobre Hiroshima y Nagasaki, y Japón se rindió. La guerra había terminado.",
        "ops": title("El final: 1945")
        + calendar(150, 180, "Mayo", color=RED)
        + [text(225, 380, "Cae Berlín", size=42), text(225, 440, "Alemania se rinde", size=34, color=GRAY)]
        + mushroom(700, 500) + [text(700, 560, "Hiroshima y Nagasaki", size=38, color=RED)]
        + calendar(1000, 180, "Agosto", color=RED)
        + [text(1075, 380, "Japón se rinde", size=40)]
        + [text(640, 650, "FIN DE LA GUERRA", size=52, color=BLUE)],
    },
    {   # 10. Consecuencias
        "narration": "El balance fue terrible: entre sesenta y setenta millones de muertos, la mayoría civiles. "
                     "Después de la guerra nació la ONU, para intentar evitar nuevos conflictos. "
                     "Y el mundo quedó dividido entre Estados Unidos y la Unión Soviética: comenzaba la Guerra Fría.",
        "ops": title("¿Qué dejó la guerra?")
        + [text(230, 190, "60-70 millones", size=46, color=RED), text(230, 245, "de muertos", size=38)]
        + person(150, 400, 0.8, color=GRAY) + person(230, 400, 0.8, color=GRAY) + person(310, 400, 0.8, color=GRAY)
        + globe(640, 330, 95, color=BLUE) + laurel(640, 330, 135)
        + [text(640, 520, "Nace la ONU", size=44, color=BLUE)]
        + person(950, 370, 0.9, color=BLUE) + person(1130, 370, 0.9, color=RED)
        + lightning(1040, 330)
        + [text(950, 460, "EE. UU.", size=34, color=BLUE), text(1130, 460, "URSS", size=34, color=RED),
           text(1040, 520, "Guerra Fría", size=44)],
    },
]
