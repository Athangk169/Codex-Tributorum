import React from 'react';

const hymnLitany = `Druvata Imperator dux noster;
in eman sua firmissimus. 
Sacrificium eius illuminare fecit;
Druvata nostrae puritas
Nos kandu electa eius
Egredere facem mahsemo.
Renuntiatio eius helel;
 Per tenebras et pólemos.
Nam qui eius ma'or.
Azar mundans iacet.
Hostes Imperium,
Da veniam irae.
Ora Imperator, praebe nobis tuam fortitudinem 
Ut simus tui justi khang.
Omnis ut efches,
Nullus furor sanctum eius effugiat.\n\n`;

const AmbienceLayer = () => {
  return (
    <div className="hymn-bg">
      <div className="hymn-scroll">
        {hymnLitany.repeat(50)}
      </div>
    </div>
  );
};

export default AmbienceLayer;