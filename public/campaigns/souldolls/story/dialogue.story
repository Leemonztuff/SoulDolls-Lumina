== dollwright
if starter-chosen
  - Take good care of your souldoll! #line:DF69ED733FBBBEB306B3F23E860A743D
  stop
- Greetings, traveller. The Hush is swallowing names across the moor. #line:17A40DB036D3AEE85F7D6DDEDA16D44F
- Choose a companion to journey with you. #line:9C0C0ABD2E8E0356F2A60B2FB0451572
choice Which souldoll will you take? #line:192380310EF1BFF4AC496ABC15659F5D
  > Peatling (Grass) #line:C2C3328E5DB88C94EAD428764E9A2439
    creature give peatling level 5
    creature give orb 5
    set starter-chosen
    - Take good care of Peatling! #line:E39F8DDF9CD9CB3EC5AED1192F71C4E1
  > Gloamwing (Fire) #line:CD2ADB849CD4DEAE2A589579072BFB6B
    creature give gloamwing level 5
    creature give orb 5
    set starter-chosen
    - Gloamwing's flame will warm your way! #line:9165D60C4434AD2B0F1D5A0F93B35839
  > Tidewisp (Water) #line:7181FAE413EFE7CE17FAD36E0289191D
    creature give tidewisp level 5
    creature give orb 5
    set starter-chosen
    - Tidewisp will guide you through the tides! #line:E02DA9B1A25DC7FC28B01B0F7396B207
- Take these orbs to catch wild critters along the road. #line:B2ED0AE71E7F5E69BC03E2D813E1994E
give bell-clapper 1

== corvin
if talked-corvin
  - Mind the quiet on the road. #line:48CE4172CA761B6794F15FE3469D8F8B
  stop
- Keep your souldolls close. The Hush turns wild critters restless. #line:1971E0C14A3B397E154EBAB729E234EF

== bram
- Rest by the fire, friend. Gloamford lies further east. #line:3E0591FCC7BFA6F6F5FBB478B8C10E3C

== orla
- The Bellbindery holds the ancient logs of all named dolls. #line:3765ACBE53E2CF03BB022B7D75D98D4B

== maren
- Thank you for returning the Silenced Clapper. The bindery door is open. #line:9F51E10722DC8212BA2792BD16DD2744

== rowan
- The rain in Whisperfen never truly stops, but the path is clear. #line:FF875F1725C59981614DB3A2EDDA4454

== gull
- Hollow Tide Cavern connects the fen to our quay. Watch your step. #line:893AC32998959DC73F98A4E5F0BB451D
give salt-toffee 1

== vane
- Ring the bell, traveller! Let the light shine once more! #line:2AE0226AE5EFDE4A39B6B82EF243FC68
