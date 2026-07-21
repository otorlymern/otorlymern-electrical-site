#!/usr/bin/env python3
"""Build the OES Manuals Archive index from the Wasabi PDF collection.

The script keeps hand-curated fields from existing archive records, creates
deterministic PDFs beside image documents when requested, and emits one
searchable archive record for every PDF below the bucket's ``pdfs`` folder.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path, PurePosixPath
from urllib.parse import quote, unquote, urlsplit


MEDIA_ORIGIN = "https://media.otorlymern-electrical.com"
DEFAULT_SOURCE_ROOT = Path(
    "/Users/augie/Library/Application Support/Mountain Duck/Volumes.noindex/"
    "AlphaWasabi.localized/media.otorlymern-electrical.com/pdfs"
)
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARCHIVE_PATH = REPO_ROOT / "manuals/data/archive.json"
TEMP_ROOT = REPO_ROOT / "tmp/pdfs/archive-image-conversion"

IMAGE_EXTENSIONS = {
    ".bmp",
    ".gif",
    ".heic",
    ".jpeg",
    ".jpg",
    ".png",
    ".tif",
    ".tiff",
    ".webp",
}

# This is a software/project asset bundle, not an archive document collection.
EXCLUDED_SUBTREES = (PurePosixPath("video-docs/Virtus VR"),)

# These source objects are truncated or have invalid headers. Per archive policy,
# leave them untouched and omit them until healthy replacements are available.
IGNORED_DAMAGED_IMAGES = {
    PurePosixPath("diy/j-haible/jh4_vcf_vca_schemo4.gif"),
    PurePosixPath("manuals/mixing-desks-mixers/Audiofax_12x3_Console1.jpg"),
    PurePosixPath("manuals/mixing-desks-mixers/Fairchild_664_668.jpg"),
    PurePosixPath("service-schems/panasonic-slimline-tapemachine.jpg"),
}

CATEGORY_INFO = {
    "analog-computing": {
        "label": "Analog Computing",
        "brand": "OES Analog Computing Archive",
        "tags": ["analog computing", "computing", "electronics"],
    },
    "books": {
        "label": "Books",
        "brand": "OES Book Archive",
        "tags": ["book", "reference", "research"],
    },
    "diy": {
        "label": "DIY Electronics",
        "brand": "OES DIY Archive",
        "tags": ["diy", "electronics", "build"],
    },
    "engineering-recording-techniques": {
        "label": "Engineering & Recording Techniques",
        "brand": "OES Recording Archive",
        "tags": ["audio engineering", "recording", "technique"],
    },
    "manuals": {
        "label": "Equipment Manuals",
        "brand": "OES Manuals Archive",
        "tags": ["manual", "equipment", "operation"],
    },
    "microphones": {
        "label": "Microphones",
        "brand": "OES Microphone Archive",
        "tags": ["microphone", "recording", "audio engineering"],
    },
    "resources": {
        "label": "Resources",
        "brand": "OES Resource Archive",
        "tags": ["resource", "reference", "research"],
    },
    "service-schems": {
        "label": "Service Documents & Schematics",
        "brand": "OES Service Archive",
        "tags": ["service", "schematic", "electronics", "repair"],
    },
    "video-docs": {
        "label": "Video Documents",
        "brand": "OES Video Archive",
        "tags": ["video", "video synthesis", "documentation"],
    },
}

FOLDER_TAG_ALIASES = {
    "andrei jay vserp images": ["andrei jay", "vserpi", "vsejet", "controller overlay"],
    "fx rackunits": ["rack effects", "signal processing", "effects unit"],
    "g richter": ["grant richter", "wiard"],
    "j haible": ["juergen haible", "analog synthesizer diy"],
    "lzx style video euro companies": ["video synthesizer", "eurorack video"],
    "mixing desks mixers": ["mixing console", "mixer"],
    "nicholas collins": ["nicolas collins", "handmade electronic music"],
    "p blasser": ["peter blasser", "ciat lonbarde"],
    "paper circuits": ["paper circuit", "ciat lonbarde"],
    "r hordijk": ["rob hordijk", "hordijk modular"],
    "syntonie master": ["syntonie", "video synthesizer"],
    "tridexmuse": ["triadex muse", "algorithmic composition"],
    "wiard docs": ["wiard", "grant richter"],
}

BRANDS = {
    "altec": "Altec Lansing",
    "amf": "AMF",
    "api": "API",
    "arp": "ARP",
    "audiofax": "Audiofax",
    "beckman": "Beckman",
    "bogen": "Bogen",
    "boss": "Boss",
    "buchla": "Buchla",
    "burr brown": "Burr-Brown",
    "casio": "Casio",
    "dbx": "dbx",
    "digisound": "Digisound",
    "digitech": "DigiTech",
    "eico": "EICO",
    "eml": "EML",
    "ems": "EMS",
    "fairchild": "Fairchild",
    "fisher": "Fisher",
    "fostex": "Fostex",
    "gotham": "Gotham Audio",
    "hordijk": "Hordijk",
    "ikegami": "Ikegami",
    "korg": "Korg",
    "lzx": "LZX Industries",
    "moog": "Moog",
    "mungo": "Mungo",
    "mu tron": "Mu-Tron",
    "mutron": "Mu-Tron",
    "oberheim": "Oberheim",
    "orban": "Orban",
    "paia": "PAiA",
    "panasonic": "Panasonic",
    "ppg": "PPG",
    "rca": "RCA",
    "revox": "Revox",
    "roland": "Roland",
    "serge": "Serge",
    "shure": "Shure",
    "signetics": "Signetics",
    "sony": "Sony",
    "syntonie": "Syntonie",
    "tascam": "Tascam",
    "teac": "TEAC",
    "telefunken": "Telefunken",
    "wiard": "Wiard",
    "yamaha": "Yamaha",
}

BRAND_TITLE_FORMS = {
    "altec": "Altec",
    "api": "API",
    "arp": "ARP",
    "dbx": "dbx",
    "eico": "EICO",
    "eml": "EML",
    "ems": "EMS",
    "fostex": "Fostex",
    "korg": "Korg",
    "lzx": "LZX",
    "paia": "PAiA",
    "ppg": "PPG",
    "rca": "RCA",
    "revox": "Revox",
    "roland": "Roland",
    "serge": "Serge",
    "shure": "Shure",
    "sony": "Sony",
    "tascam": "Tascam",
    "teac": "TEAC",
    "yamaha": "Yamaha",
}

TITLE_OVERRIDES = {
    "analog-computing/anhyb.pdf": "Analog and Hybrid Computing - Bernd Ulmann",
    "analog-computing/argonne.pdf": "Introduction to Electronic Analog Computing - Lawrence T. Bryant and Louis C. Just",
    "analog-computing/opamp.pdf": "Unsung Hero Pioneered the Op Amp",
    "books/0101_1975.pdf": "Polyphony, Volume 1, No. 1 (1975)",
    "books/0202_276_200 (1).pdf": "Polyphony, February 1976",
    "books/0202_276_200.pdf": "Polyphony, February 1976",
    "books/2_Kaegi.pdf": "Music and Technology in the Europe of 1970 - Werner Kaegi",
    "books/EMR1.pdf": "Electronic Music Review No. 1 (January 1967)",
    "books/RTS_1.pdf": "Practical Synthesis for Electronic Music, Volume One (2nd Edition)",
    "books/RTS_2.pdf": "Practical Synthesis for Electronic Music, Volume Two (2nd Edition)",
    "books/RTS_3.pdf": "A Foundation for Electronic Music (2nd Edition)",
    "books/arrl_1936.pdf": "The Radio Amateur's Handbook (1936)",
    "books/book.pdf": "The Theory and Technique of Electronic Music - Miller Puckette",
    "books/BuchlaTranscription.pdf": "Transcription of Buchla Tape",
    "books/Catalogue.pdf": "Serge Modular Music Systems Catalog and Data Sheets",
    "books/cmoscb.pdf": "CMOS Cookbook, Fourth Edition - Don Lancaster",
    "books/coyne.pdf": "Coyne Electrical-Radio Troubleshooting Manual",
    "books/efe.pdf": "Electronics for Engineers - John Markus and Vin Zeluff",
    "books/electronicmusic.pdf": "The Electronic Musical Instrument Manual - Alan Douglas",
    "books/LearnMusicWithSynths1974.pdf": "Learning Music with Synthesizers - David Friend, Alan R. Pearlman, and Thomas D. Piggott",
    "diy/nicholas-collins/19680020053.pdf": "Microelectronic Device Data Handbook, Volume 1",
    "diy/nicholas-collins/Music183-184.pdf": "Introduction to Electronic Music 183/184 - Nicholas Collins Course Notebooks",
    "diy/nicholas-collins/perfectbeep.pdf": "Searching for the Perfect Beep - Nicolas Collins",
    "diy/nicholas-collins/RoomtoneScore2017.pdf": "Roomtone Variations (2013-14) - Nicolas Collins",
    "diy/nicholas-collins/SMCT4-3.pdf": "Semiconducting: Making Music After the Transistor - Nicolas Collins",
    "diy/nicholas-collins/TapeOpReverb.pdf": "Build Your Own Reverb - Nicolas Collins",
    "diy/p-blasser/compmusCOLer.pdf": "Computer Music Coloring Papers - Peter Blasser",
    "diy/p-blasser/document.pdf": "Stores at the Mall - Peter Blasser",
    "diy/paper-circuits/blackgroundcorn.pdf": "Ciat-Lonbarde Blackground Corn Paper Circuit",
    "diy/paper-circuits/fetphantom.pdf": "Ciat-Lonbarde FET Phantom Paper Circuit",
    "diy/paper-circuits/hardsyncsuelchdb.pdf": "Ciat-Lonbarde Hard-Sync Squelch Paper Circuit",
    "diy/paper-circuits/touchkbdb.pdf": "Ciat-Lonbarde Touch Keyboard Paper Circuit",
    "diy/paper-circuits/wiringpots.pdf": "Linnet/Gale Potentiometer Wiring Guide",
    "diy/paper-circuits/222db.pdf": "Ciat-Lonbarde 2x2 Paper Circuit",
    "diy/paper-circuits/Rollz-5.pdf": "Ciat-Lonbarde Rollz-5 Book",
    "diy/paper-circuits/gongdb.pdf": "Ciat-Lonbarde Gong Paper Circuit",
    "diy/paper-circuits/grassass.pdf": "Ciat-Lonbarde Grass Paper Circuit",
    "diy/paper-circuits/utils.pdf": "Ciat-Lonbarde Utilities Paper Circuit",
    "diy/paper-circuits/vcodb.pdf": "Ciat-Lonbarde VCO Paper Circuit",
    "diy/paper-circuits/vcrollz34.pdf": "Ciat-Lonbarde VC Rollz 3/4 Paper Circuit",
    "diy/projects/9780521177238_frontmatter.pdf": "Learning the Art of Electronics - Thomas C. Hayes and Paul Horowitz (Front Matter)",
    "diy/projects/AES1.PDF": "Experimental Electronic Music Devices Employing Walsh Functions - Bernard A. Hutchins Jr.",
    "diy/projects/avsystediagram.pdf": "Audio Video Synthesis",
    "diy/projects/beatgoeson.pdf": "Build a Digital Pattern Generator - John Blacet",
    "diy/projects/BlinkyLightsPolyphony0302.pdf": "LED Wall Art: Visual Environment Machine - Craig Anderton",
    "diy/projects/DPGproject.pdf": "Build a Digital Pattern Generator - John Blacet",
    "diy/projects/dronezillacmosbuild.pdf": "A Closer Look at Digital Dronezilla - Philip C. Gallo",
    "diy/projects/GRAPHICEQandFormant.pdf": "Graphic Equalizers for Fixed Formant Filtering - Bob Lewis",
    "diy/projects/haroldbodeklang.pdf": "Harald Bode Klangumwandler No. 2",
    "diy/projects/Music183-184.pdf": "Introduction to Electronic Music 183/184 - Nicholas Collins Course Notebooks",
    "diy/projects/TAB101.pdf": "Mallory TAB101 Ring Modulator/Demodulator Data Sheet",
    "diy/projects/panner.pdf": "Panning for Fun",
    "diy/projects/TridexMuse/US3610801.pdf": "Digital Music Synthesizer - U.S. Patent 3,610,801",
    "diy/projects/TridexMuse/psyctone.pdf": "Build the Psych-Tone Melody Synthesizer - Don Lancaster",
    "diy/projects/TridexMuse/TriadexMuseUserManual.pdf": "Triadex Muse User Manual",
    "diy/projects/vocalsynthesiuss.pdf": "Vocal Synthesis - Peter Miller",
    "diy/r-hordijk/nordmodularbook.pdf": "Advanced Programming Techniques for Modular Synthesizers",
    "manuals/488portastudio_om_tascam_d.pdf": "Tascam 488 Portastudio Owner's Manual",
    "manuals/a3340s_sm_teac.pdf": "TEAC A-3340S Service Manual",
    "manuals/arp-2600-owners-manual.pdf": "ARP 2600 Owner's Manual",
    "manuals/Buchla_200_manual.pdf": "Buchla 200 Series Manual",
    "manuals/Buchla_Music_Easel_Manual.pdf": "Buchla Music Easel Manual",
    "manuals/EML_polybox_manual.pdf": "EML Poly-Box Manual",
    "manuals/Fisher_PR6_Manual.pdf": "Fisher PR-6 Manual",
    "manuals/hfe_tascam_m-208_216_en.pdf": "Tascam M-208 / M-216 Manual",
    "manuals/hfe_teac_a-1500u_flyer_en.pdf": "TEAC A-1500U Flyer",
    "manuals/hfe_teac_a-3340s.pdf": "TEAC A-3340S Manual",
    "manuals/hfe_teac_stereo_tape_recorders_1966_en.pdf": "TEAC Stereo Tape Recorders (1966)",
    "manuals/hfe_yamaha_mt4x_en.pdf": "Yamaha MT4X Owner's Manual",
    "manuals/mungoeuro.pdf": "Mungo Euro Manual",
    "manuals/oberheim-matrix-1000-owners-manual.pdf": "Oberheim Matrix-1000 Owner's Manual",
    "manuals/ppg-w23-dm.pdf": "PPG Wave 2.3 Manual",
    "manuals/revox_a77_user_manual_en.pdf": "Revox A77 User Manual",
    "manuals/Roland_Alpha_Juno_1.pdf": "Roland Alpha Juno-1 Manual",
    "manuals/roland-alpha-juno-1.pdf": "Roland Alpha Juno-1 Manual",
    "manuals/Roland_Juno-2_Usermanual.pdf": "Roland Alpha Juno-2 User Manual",
    "manuals/Roland_Juno106_Owners_Manual.pdf": "Roland Juno-106 Owner's Manual",
    "manuals/roland-juno106-owners-manual.pdf": "Roland Juno-106 Owner's Manual",
    "manuals/roland-juno106-service-notes.pdf": "Roland Juno-106 Service Notes",
    "manuals/Roland_JX-3P_Owners_Manual.pdf": "Roland JX-3P Owner's Manual",
    "manuals/roland-tr-606-owners-manual.pdf": "Roland TR-606 Owner's Manual",
    "manuals/roland-tr-909-owners-manual.pdf": "Roland TR-909 Owner's Manual",
    "manuals/sergemanual.pdf": "Serge Modular Synthesizer Manual",
    "manuals/ciani-buchla-cookbook.pdf": "Suzanne Ciani's Buchla Cookbook",
    "manuals/tascam-144-brochure.pdf": "Tascam 144 Brochure",
    "manuals/tascam-144-owners-manual.pdf": "Tascam 144 Owner's Manual",
    "manuals/tascam-234-brochure.pdf": "Tascam 234 Brochure",
    "manuals/tascam-234-owners-manual.pdf": "Tascam 234 Owner's Manual",
    "manuals/tascam-porta-02-manual.pdf": "Tascam Porta 02 Manual",
    "manuals/tascam32.pdf": "Tascam 32 Manual",
    "manuals/tascammfp01manual.pdf": "Tascam MF-P01 Manual",
    "manuals/teac-multitrack-primer.pdf": "TEAC Multitrack Recording Primer",
    "manuals/teac_white_paper.pdf": "TEAC Recording White Paper",
    "manuals/twinpeak-manual.pdf": "Hordijk Twin Peak Resonator Manual",
    "manuals/vcs3.pdf": "EMS VCS 3 Manual",
    "manuals/fx-rackunits/323_Service_Manual.pdf": "Ursa Major 323 Service Manual",
    "manuals/fx-rackunits/672A_Manual.pdf": "Orban 672A Equalizer Operating Manual",
    "manuals/fx-rackunits/analab-1100-manual.pdf": "Analab 1100 Operating Manual",
    "engineering-recording-techniques/advancedmusicsynthesis.pdf": "Advanced Music Synthesis - Chris Jordan",
    "engineering-recording-techniques/homerecordingpart2.pdf": "Synapse, Volume 4, Number 5 (July/August 1980)",
    "manuals/fx-rackunits/ChrisMooreAticlesAN9.pdf": "Digital Reverberation: Beyond the Technology - Christopher Moore (AN-9)",
    "manuals/fx-rackunits/EffectronCatalog.pdf": "Deltalab Effectron Catalog",
    "manuals/fx-rackunits/ShrisMooreArticleAN11.pdf": "First Order Digital Filters: An Audio Cookbook - Christopher Moore (AN-11)",
    "resources/9780521177238_frontmatter.pdf": "Learning the Art of Electronics - Thomas C. Hayes and Paul Horowitz (Front Matter)",
    "resources/AES1.PDF": "Experimental Electronic Music Devices Employing Walsh Functions - Bernard A. Hutchins Jr.",
    "resources/fostex1984.pdf": "Fostex Multitrack Division Catalog (1984)",
    "resources/homerecordingpart2.pdf": "Synapse, Volume 4, Number 5 (July/August 1980)",
    "service-schems/EN102.pdf": "Electronotes 102 (June 1979)",
    "service-schems/EN110.pdf": "Electronotes 110 (February 1980)",
    "service-schems/Paia_4730.pdf": "PAiA 4730 Multi-Modal Filter Manual",
    "service-schems/PolyboxSchemos.pdf": "EML Poly-Box Schematics",
    "service-schems/pseudorandom2.pdf": "Shift Register Noise Generator Schematic",
    "service-schems/Rollz-5.pdf": "Ciat-Lonbarde Rollz-5 Book",
    "service-schems/schematic.pdf": "Two Point One Colorizer Schematic",
    "service-schems/stutter.pdf": "Variable Stuttering Pedal Schematic",
    "video-docs/Andrei Jay VSERP Images/alnano2.pdf": "Artificial Life nanoKONTROL2 Overlay",
    "video-docs/Andrei Jay VSERP Images/smnano2.pdf": "Spectral Mesh nanoKONTROL2 Overlay",
    "video-docs/Andrei Jay VSERP Images/VSERPI and VSEJET controller templates, overlays, scene settings, etc/alnano2.pdf": "Artificial Life nanoKONTROL2 Overlay",
    "video-docs/Andrei Jay VSERP Images/VSERPI and VSEJET controller templates, overlays, scene settings, etc/smnano2.pdf": "Spectral Mesh nanoKONTROL2 Overlay",
    "video-docs/Andrei Jay VSERP Images/VSERPI and VSEJET controller templates, overlays, scene settings, etc/tvnano2.pdf": "Temporal Vortex nanoKONTROL2 Overlay",
    "video-docs/3TrinsRGBSCHEM.pdf": "3TrinsRGB1c Schematics",
    "diy/g-richter/IMG_0065-image-png.pdf": "Wiard Anti-Envelope Front Panel",
    "diy/g-richter/wiard-docs/IMG_0065-image-png.pdf": "Wiard Anti-Envelope Front Panel",
    "diy/g-richter/IMG_0260-image-gif.pdf": "Wiard 300 Voltage Controlled Electro-Optical Mixer Schematic",
    "diy/g-richter/wiard-docs/IMG_0260-image-gif.pdf": "Wiard 300 Voltage Controlled Electro-Optical Mixer Schematic",
    "diy/g-richter/Wiard 300 Manual/IMG_0261-image-jpg.pdf": "Wiard 300 Manual Patch Sheet - Start Position",
    "diy/g-richter/wiard-docs/IMG_0261-image-jpg.pdf": "Wiard 300 Manual Patch Sheet - Start Position",
    "diy/g-richter/Wiard 300 Manual/IMG_0262-image-jpg.pdf": "Wiard 300 Patch Sheet - Super Sequencer",
    "diy/g-richter/wiard-docs/IMG_0262-image-jpg.pdf": "Wiard 300 Patch Sheet - Super Sequencer",
    "diy/j-haible/images-image-jpg.pdf": "Lemmy Kilmister Portrait",
    "diy/p-blasser/04 copy-image-gif.pdf": "Feedback Is an Explanation for Madnesses - Peter Blasser Drawing",
    "diy/p-blasser/07-image-gif.pdf": "Fourier Series Circuit Sketch - Peter Blasser",
    "diy/p-blasser/07-1-image-gif.pdf": "Ears Can't See, Eyes Can't Hear - Peter Blasser Drawing",
    "diy/p-blasser/07-2-image-gif.pdf": "Ears Can't See, Eyes Can't Hear - Peter Blasser Drawing",
    "diy/p-blasser/08-image-gif.pdf": "Intersections and Reflections Circuit Sketch - Peter Blasser",
    "diy/p-blasser/11-image-gif.pdf": "Ant Communication Diagram - Peter Blasser",
    "diy/p-blasser/12-image-gif.pdf": "Abstract Communication with Talk - Peter Blasser Drawing",
    "diy/p-blasser/13-image-gif.pdf": "Approaches Nada and Harry Chaos-Ball - Peter Blasser Drawing",
    "diy/p-blasser/13-1-image-gif.pdf": "Approaches Nada and Harry Chaos-Ball - Peter Blasser Drawing",
    "diy/p-blasser/17p3-image-gif.pdf": "Transistor Pair Diagram - Peter Blasser",
    "diy/p-blasser/19-image-gif.pdf": "Section Selector Circuit Drawing - Peter Blasser",
    "diy/p-blasser/19-1-image-gif.pdf": "Section Selector Circuit Drawing - Peter Blasser",
    "diy/p-blasser/IMG_3888-image-png.pdf": "Ciat-Lonbarde 5 Star Brain Bill of Materials",
    "diy/paper-circuits/IMG_3889-image-png.pdf": "Ciat-Lonbarde Rollz Strip Bill of Materials",
    "diy/paper-circuits/IMG_3891-image-png.pdf": "Ciat-Lonbarde Swoop Spokes Bill of Materials",
    "diy/paper-circuits/IMG_3892-image-png.pdf": "Ciat-Lonbarde Preamp Bill of Materials",
    "diy/paper-circuits/IMG_3894-image-png.pdf": "Ciat-Lonbarde 5/6-Rollz and ArpSerge Assembly Guide",
    "diy/r-hordijk/2dbf4eba733ede3ceb33bd3837811ba44e3e1da9-image-jpg.pdf": "Rob Hordijk Chaotic Core Block Diagram",
    "manuals/fx-rackunits/3polesim-image-png.pdf": "Three-Pole Filter Simulation",
    "service-schems/ar329-image-jpg.pdf": "AR-329 Phase Flanger Schematic",
    "service-schems/klm366-image-jpg.pdf": "Korg Poly-6 KLM-366 Main Board Schematic",
    "service-schems/Untitled-768x932-image-jpg.pdf": "Bogen DB20 Tone Control Article",
    "service-schems/xray-image-tif.pdf": "PCB X-Ray Trace Overlay",
    "video-docs/Andrei Jay VSERP Images/241306899_5758318510886853_821859032987027823_n-image-jpg.pdf": "Waaave Pool, Spectral Mesh, and Artificial Life Controller Template",
    "video-docs/Andrei Jay VSERP Images/96746974_10224230729302309_7637865094096879616_n-image-jpg.pdf": "Waaave Pool Controller Overlay",
    "video-docs/Andrei Jay VSERP Images/R8psu-image-jpg.pdf": "DC-DC Step-Down Power Module",
}

WIARD_TITLE_OVERRIDES = {
    "classicvco-031001": "Wiard GR-341 Classic VCO Manual (Rev. 031001)",
    "envelator-031001": "Wiard GR-331 Dual Envelator Manual (Rev. 031001)",
    "envelator": "Wiard Envelator Module Preliminary Manual (v0.2.1)",
    "mixolator": "Wiard Mixolator Module Preliminary Manual (v0.2.0)",
    "omnifilter": "Wiard Filter Module Preliminary Manual (v0.2.0)",
    "sequantizer": "Wiard Sequantizer Module Preliminary Manual (v0.2.1)",
    "wiard300intro-031001": "Introduction to the Wiard 300 Series Modular",
    "wogglebug-031001": "Wiard GR-371 Woggle Bug Manual (Rev. 031001)",
}

SMALL_WORDS = {"a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"}
GENERIC_PARENT_NAMES = {
    "docs",
    "documents",
    "manuals",
    "pdf",
    "pdfs",
    "resources",
    "static",
    "files",
    "images",
}

TOPIC_TAGS = {
    "analog computer": "analog computing",
    "cassette": "cassette",
    "circuit": "circuit design",
    "computer": "computing",
    "delay": "delay",
    "drum": "drum machine",
    "filter": "filter",
    "four track": "multitrack",
    "4 track": "multitrack",
    "mixer": "mixer",
    "mixing": "mixing",
    "microphone": "microphone",
    "modular": "modular synthesis",
    "oscillator": "oscillator",
    "portastudio": "multitrack",
    "reel to reel": "reel-to-reel",
    "solder": "soldering",
    "synth": "synthesis",
    "tape": "tape",
    "video": "video",
    "vocoder": "vocoder",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--archive", type=Path, default=DEFAULT_ARCHIVE_PATH)
    parser.add_argument(
        "--convert-images",
        action="store_true",
        help="Create deterministic PDF versions beside every included image file.",
    )
    parser.add_argument(
        "--replace-images",
        action="store_true",
        help="Delete source images only after their companion PDFs validate.",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="Write the resulting JSON. Without this flag, print a summary only.",
    )
    return parser.parse_args()


def normalized_relative(path: Path, root: Path) -> PurePosixPath:
    return PurePosixPath(unicodedata.normalize("NFC", path.relative_to(root).as_posix()))


def is_excluded(relative: PurePosixPath) -> bool:
    return any(relative == subtree or subtree in relative.parents for subtree in EXCLUDED_SUBTREES)


def iter_files(root: Path):
    seen_files = set()
    for directory, dirnames, filenames in os.walk(root):
        directory_path = Path(directory)
        relative_directory = normalized_relative(directory_path, root)
        dirnames[:] = list(dict.fromkeys(
            name
            for name in dirnames
            if not name.startswith("._")
            and not is_excluded(relative_directory / unicodedata.normalize("NFC", name))
        ))
        for filename in filenames:
            if filename.startswith("._") or filename in {".DS_Store", "Icon\r"}:
                continue
            path = directory_path / filename
            relative = normalized_relative(path, root)
            relative_key = relative.as_posix()
            if is_excluded(relative) or relative_key in seen_files:
                continue
            seen_files.add(relative_key)
            yield path, relative


def converted_pdf_path(image_path: Path) -> Path:
    suffix = image_path.suffix.lower().lstrip(".") or "image"
    return image_path.with_name(f"{image_path.stem}-image-{suffix}.pdf")


def convert_image(image_path: Path, output_path: Path) -> tuple[bool, str]:
    if output_path.exists() and output_path.stat().st_size > 100:
        return False, "already exists"

    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".pdf", dir=TEMP_ROOT, delete=False) as handle:
        temp_path = Path(handle.name)

    try:
        command = [
            "magick",
            str(image_path),
            "-coalesce",
            "-auto-orient",
            "-background",
            "white",
            "-alpha",
            "remove",
            "-alpha",
            "off",
            "-units",
            "PixelsPerInch",
            "-density",
            "150",
            "-quality",
            "92",
            str(temp_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True, timeout=180)
        if result.returncode != 0:
            return False, result.stderr.strip() or "ImageMagick failed"
        with temp_path.open("rb") as converted_file:
            pdf_header = converted_file.read(4)
        if temp_path.stat().st_size <= 100 or pdf_header != b"%PDF":
            return False, "conversion did not produce a valid PDF"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(temp_path, output_path)
        return True, "converted"
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, str(exc)
    finally:
        temp_path.unlink(missing_ok=True)


def convert_images(root: Path) -> tuple[int, int, list[str]]:
    if not shutil.which("magick"):
        raise RuntimeError("ImageMagick's 'magick' command is required for image conversion")

    converted = 0
    skipped = 0
    failures: list[str] = []
    images = [
        (path, relative)
        for path, relative in iter_files(root)
        if path.suffix.lower() in IMAGE_EXTENSIONS and relative not in IGNORED_DAMAGED_IMAGES
    ]
    for index, (image_path, relative) in enumerate(images, start=1):
        output_path = converted_pdf_path(image_path)
        changed, detail = convert_image(image_path, output_path)
        if changed:
            converted += 1
        elif detail == "already exists":
            skipped += 1
        else:
            failures.append(f"{relative}: {detail}")
        print(
            f"[{index:>3}/{len(images)}] {detail}: {relative}",
            file=sys.stderr,
            flush=True,
        )
    return converted, skipped, failures


def valid_pdf(path: Path) -> bool:
    try:
        if path.stat().st_size <= 100:
            return False
        with path.open("rb") as pdf_file:
            if pdf_file.read(4) != b"%PDF":
                return False
        result = subprocess.run(
            ["pdfinfo", str(path)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            return False
        match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout, flags=re.M)
        return bool(match and int(match.group(1)) >= 1)
    except (OSError, subprocess.TimeoutExpired):
        return False


def remove_replaced_images(root: Path) -> tuple[int, list[str]]:
    removed = 0
    retained = []
    images = [
        (path, relative)
        for path, relative in iter_files(root)
        if path.suffix.lower() in IMAGE_EXTENSIONS and relative not in IGNORED_DAMAGED_IMAGES
    ]
    for image_path, relative in images:
        replacement = converted_pdf_path(image_path)
        if not valid_pdf(replacement):
            retained.append(relative.as_posix())
            continue
        image_path.unlink()
        removed += 1
    return removed, retained


def archive_relative_from_url(raw_url: str) -> str | None:
    if not raw_url:
        return None
    path = unquote(urlsplit(raw_url).path)
    marker = "/pdfs/"
    if marker not in path:
        return None
    return unicodedata.normalize("NFC", path.split(marker, 1)[1]).casefold()


def load_existing(archive_path: Path) -> dict:
    if not archive_path.exists():
        return {"config": {}, "manuals": [], "soldUnits": []}
    return json.loads(archive_path.read_text(encoding="utf-8"))


def strip_generated_image_suffix(stem: str) -> tuple[str, str | None]:
    match = re.search(r"-image-(bmp|gif|heic|jpeg|jpg|png|tif|tiff|webp)$", stem, flags=re.I)
    if not match:
        return stem, None
    return stem[: match.start()], match.group(1).upper()


def words_from_stem(stem: str) -> list[str]:
    stem = unicodedata.normalize("NFC", stem)
    stem = re.sub(r"^(?:hfe|manualslib)[-_ ]+", "", stem, flags=re.I)
    stem = re.sub(r"\s+-\s+libgen(?:\s+copy)?$", "", stem, flags=re.I)
    stem = re.sub(r"\s+copy$", "", stem, flags=re.I)
    stem = re.sub(r"\s*\(\d+\)$", "", stem)
    stem = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", stem)
    stem = re.sub(r"(?i)usermanual", "user manual", stem)
    stem = re.sub(r"(?i)ownersmanual", "owners manual", stem)
    stem = re.sub(r"(?i)servicemanual", "service manual", stem)
    stem = re.sub(r"(?i)schematics?", "schematic", stem)
    stem = re.sub(r"[_]+", " ", stem)
    stem = re.sub(r"(?<!\d)-(?!\d)", " ", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" ._-")
    return stem.split()


def smart_word(word: str, index: int) -> str:
    lower = word.lower()
    if lower in BRAND_TITLE_FORMS:
        return BRAND_TITLE_FORMS[lower]
    if lower in SMALL_WORDS and index > 0:
        return lower
    if re.fullmatch(r"[ivxlcdm]+", lower) and len(lower) <= 5:
        return lower.upper()
    if re.fullmatch(r"v?\d+(?:\.\d+)+[a-z]?", lower):
        return word.lower() if lower.startswith("v") else word.upper()
    if any(character.isdigit() for character in word):
        return word.upper()
    if word.isupper() and len(word) <= 6:
        return word
    return lower.capitalize()


def humanize_stem(stem: str) -> str:
    words = words_from_stem(stem)
    title = " ".join(smart_word(word, index) for index, word in enumerate(words))
    title = re.sub(r"(?i)\bowners manual\b", "Owner's Manual", title)
    title = re.sub(r"(?i)\busers manual\b", "User Manual", title)
    title = re.sub(r"(?i)\buser manual\b", "User Manual", title)
    title = re.sub(r"(?i)\bservice manual\b", "Service Manual", title)
    title = re.sub(r"(?i)\bbuild guide\b", "Build Guide", title)
    title = re.sub(r"(?i)\buser guide\b", "User Guide", title)
    title = re.sub(r"(?i)\bowner s\b", "Owner's", title)
    return title or "Untitled Archive Document"


def title_for(relative: PurePosixPath) -> tuple[str, str | None]:
    relative_key = relative.as_posix()
    if relative_key in TITLE_OVERRIDES:
        return TITLE_OVERRIDES[relative_key], None
    source_stem, converted_from = strip_generated_image_suffix(relative.stem)
    wiard_key = re.sub(r"\s+copy$", "", source_stem, flags=re.I).casefold()
    if "g-richter" in relative.parts and wiard_key in WIARD_TITLE_OVERRIDES:
        return WIARD_TITLE_OVERRIDES[wiard_key], converted_from
    return humanize_stem(source_stem), converted_from


def searchable_text(relative: PurePosixPath, title: str) -> str:
    raw = f"{relative.as_posix()} {title}"
    raw = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", raw.lower()).strip()


def detect_brand(relative: PurePosixPath, title: str, default_brand: str) -> str:
    haystack = f" {searchable_text(relative, title)} "
    for needle, display in sorted(BRANDS.items(), key=lambda item: len(item[0]), reverse=True):
        normalized_needle = re.sub(r"[^a-z0-9]+", " ", needle.lower()).strip()
        if f" {normalized_needle} " in haystack:
            return display
    return default_brand


def document_type(relative: PurePosixPath, title: str, converted_from: str | None) -> tuple[str, str, str]:
    text = searchable_text(relative, title)
    top_level = relative.parts[0]
    if "service manual" in text or "service notes" in text:
        return "SVC", "service manual", "service manual"
    if top_level == "service-schems" or any(term in text for term in ("schematic", "circuit diagram", "wiring diagram")):
        return "SCHEM", "schematic", "schematic"
    if "brochure" in text or "flyer" in text or "catalog" in text:
        return "BROCH", "brochure or catalog", "brochure"
    if "datasheet" in text or "data sheet" in text or "spec sheet" in text:
        return "DATA", "data sheet", "data sheet"
    if "build guide" in text or "assembly guide" in text:
        return "BUILD", "build guide", "build guide"
    if "reference card" in text or "reference sheet" in text:
        return "REF", "reference sheet", "reference"
    if "user guide" in text or "guide" in text:
        return "GUIDE", "guide", "guide"
    if "manual" in text or top_level == "manuals":
        return "MAN", "manual", "manual"
    if top_level == "books":
        return "BOOK", "book", "book"
    if "white paper" in text or "paper" in text:
        return "PAPER", "paper", "paper"
    if "article" in text or re.search(r"\b(?:emm|mt|sos|polyphony)[ _-]?\d", text):
        return "ART", "article", "article"
    if converted_from:
        return "IMG", "image document", "converted image"
    return "DOC", "document", "document"


def model_for(relative: PurePosixPath, title: str, brand: str, category_label: str) -> str:
    if relative.parts[0] in {"books", "resources", "analog-computing", "engineering-recording-techniques"}:
        return category_label

    candidate = title
    for form in {brand, *BRAND_TITLE_FORMS.values()}:
        candidate = re.sub(rf"^\s*{re.escape(form)}\s+", "", candidate, flags=re.I)
    candidate = re.sub(
        r"(?i)\s+(?:owner'?s|user|service|technical|operation|instruction|build)?\s*"
        r"(?:manual|guide|schematic|schematics|notes|brochure|catalog|flyer|reference(?: card| sheet)?|documentation)$",
        "",
        candidate,
    ).strip(" -")
    if candidate and candidate.casefold() != title.casefold():
        return candidate[:100]

    for parent in reversed(relative.parts[1:-1]):
        if parent.casefold() not in GENERIC_PARENT_NAMES:
            return humanize_stem(parent)[:100]
    return category_label


def slugify(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_value.lower()).strip("-")
    return slug or "archive-document"


def id_for(relative: PurePosixPath) -> str:
    base = slugify(str(relative.with_suffix("")))
    if len(base) <= 120:
        return base
    digest = hashlib.sha1(relative.as_posix().encode("utf-8")).hexdigest()[:10]
    return f"{base[:109].rstrip('-')}-{digest}"


def code_token(relative: PurePosixPath, title: str) -> str:
    stem, _ = strip_generated_image_suffix(relative.stem)
    raw = stem if re.search(r"[A-Za-z]", stem) else title
    token = re.sub(r"[^A-Z0-9]+", "-", unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii").upper()).strip("-")
    token = re.sub(r"^(?:HFE|MANUALSLIB)-", "", token)
    generic = {"PDF", "DOCUMENT", "DOC"}
    parts = [part for part in token.split("-") if part and part not in generic]
    token = "-".join(parts) or "FILE"
    if len(token) > 34:
        digest = hashlib.sha1(relative.as_posix().encode("utf-8")).hexdigest()[:6].upper()
        token = f"{token[:27].rstrip('-')}-{digest}"
    return token


def unique_code(prefix: str, token: str, relative: PurePosixPath, used: set[str]) -> str:
    candidate = f"OES-{prefix}-{token}"
    if candidate.casefold() not in used:
        used.add(candidate.casefold())
        return candidate
    digest = hashlib.sha1(relative.as_posix().encode("utf-8")).hexdigest()[:6].upper()
    candidate = f"OES-{prefix}-{token[:27].rstrip('-')}-{digest}"
    used.add(candidate.casefold())
    return candidate


def tags_for(
    relative: PurePosixPath,
    title: str,
    brand: str,
    category_tags: list[str],
    type_tag: str,
    converted_from: str | None,
) -> list[str]:
    tags = [*category_tags, type_tag]
    if not brand.startswith("OES "):
        tags.append(brand.lower())

    text = searchable_text(relative, title)
    for needle, tag in TOPIC_TAGS.items():
        if needle in text:
            tags.append(tag)

    for parent in relative.parts[1:-1]:
        normalized = slugify(parent).replace("-", " ")
        if normalized and normalized not in GENERIC_PARENT_NAMES:
            if len(normalized) <= 60:
                tags.append(normalized)
            tags.extend(FOLDER_TAG_ALIASES.get(normalized, []))
    if converted_from:
        tags.extend(["converted image", converted_from.lower()])

    deduplicated = []
    seen = set()
    for tag in tags:
        cleaned = re.sub(r"\s+", " ", tag).strip().lower()
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            deduplicated.append(cleaned)
    return deduplicated[:22]


def notes_for(title: str, type_phrase: str, category_label: str, converted_from: str | None) -> str:
    if converted_from:
        return (
            f"A {type_phrase} titled {title}, converted from {converted_from} and filed in "
            f"the OES {category_label} collection."
        )
    return f"A {type_phrase} covering {title}, filed in the OES {category_label} collection."


def public_url(relative: PurePosixPath) -> str:
    return f"{MEDIA_ORIGIN}/pdfs/{quote(relative.as_posix(), safe='/-._~')}"


def build_records(root: Path, existing_data: dict, today: str) -> list[dict]:
    existing_by_relative = {}
    for manual in existing_data.get("manuals", []):
        relative = archive_relative_from_url(manual.get("pdfUrl", ""))
        if relative:
            existing_by_relative[relative] = manual

    pdfs = sorted(
        (
            (path, relative)
            for path, relative in iter_files(root)
            if path.suffix.casefold() == ".pdf"
        ),
        key=lambda item: item[1].as_posix().casefold(),
    )

    used_ids: set[str] = set()
    used_codes: set[str] = set()
    records = []
    for _, relative in pdfs:
        category = CATEGORY_INFO.get(
            relative.parts[0],
            {"label": humanize_stem(relative.parts[0]), "brand": "OES Archive", "tags": [slugify(relative.parts[0]).replace("-", " ")]},
        )
        generated_title, converted_from = title_for(relative)
        existing = existing_by_relative.get(relative.as_posix().casefold(), {})
        generated_brand = detect_brand(relative, generated_title, category["brand"])
        generated_model = model_for(relative, generated_title, generated_brand, category["label"])
        type_prefix, type_phrase, type_tag = document_type(relative, generated_title, converted_from)

        record_id = existing.get("id") or id_for(relative)
        if record_id.casefold() in used_ids:
            digest = hashlib.sha1(relative.as_posix().encode("utf-8")).hexdigest()[:8]
            record_id = f"{record_id}-{digest}"
        used_ids.add(record_id.casefold())

        existing_code = existing.get("manualCode")
        if existing_code and existing_code.casefold() not in used_codes:
            manual_code = existing_code
            used_codes.add(existing_code.casefold())
        else:
            manual_code = unique_code(type_prefix, code_token(relative, generated_title), relative, used_codes)

        existing_notes = existing.get("notes", "")
        notes_are_generic = (
            existing_notes in {"", "Manual from the OES media archive."}
            or (existing_notes.startswith("A ") and "filed in the OES " in existing_notes)
        )
        existing_tags = existing.get("tags", [])
        generated_tags = tags_for(
            relative,
            generated_title,
            generated_brand,
            category["tags"],
            type_tag,
            converted_from,
        )
        merged_tags = list(dict.fromkeys([*existing_tags, *generated_tags]))[:24]

        curated_existing_title = existing.get("title") if not notes_are_generic else ""
        record_title = existing.get("displayTitle") or curated_existing_title or generated_title
        record_title = record_title.replace("—", "-").replace("–", "-")
        record = {
            "id": record_id,
            "title": record_title,
            "brand": existing.get("brand") if existing.get("brand") not in {None, "", "OES Archive"} else generated_brand,
            "model": existing.get("model") or generated_model,
            "manualCode": manual_code,
            "tags": merged_tags,
            "pdfUrl": public_url(relative),
            "thumbnailUrl": (
                ""
                if archive_relative_from_url(existing.get("thumbnailUrl", ""))
                else existing.get("thumbnailUrl", "")
            ),
            "notes": notes_for(generated_title, type_phrase, category["label"], converted_from) if notes_are_generic else existing_notes,
            "createdAt": existing.get("createdAt", today),
            "updatedAt": today,
        }
        records.append(record)

    records.sort(key=lambda record: (record["title"].casefold(), record["pdfUrl"].casefold()))
    return records


def validate(records: list[dict], source_root: Path) -> list[str]:
    errors = []
    ids = [record["id"].casefold() for record in records]
    codes = [record["manualCode"].casefold() for record in records]
    urls = [record["pdfUrl"] for record in records]
    for label, values in (("id", ids), ("manual code", codes), ("PDF URL", urls)):
        duplicates = [value for value, count in Counter(values).items() if count > 1]
        if duplicates:
            errors.append(f"duplicate {label}s: {duplicates[:10]}")

    actual_pdf_count = sum(
        1 for path, _ in iter_files(source_root) if path.suffix.casefold() == ".pdf"
    )
    if len(records) != actual_pdf_count:
        errors.append(f"record count {len(records)} does not match included PDF count {actual_pdf_count}")

    required = {"id", "title", "brand", "model", "manualCode", "tags", "pdfUrl", "notes", "createdAt", "updatedAt"}
    for index, record in enumerate(records):
        missing = required - record.keys()
        if missing:
            errors.append(f"record {index} is missing {sorted(missing)}")
    return errors


def main() -> int:
    args = parse_args()
    source_root = args.source_root.expanduser().resolve()
    archive_path = args.archive.expanduser().resolve()
    if not source_root.is_dir():
        print(f"Source root not found: {source_root}", file=sys.stderr)
        return 2

    if args.convert_images:
        converted, skipped, failures = convert_images(source_root)
        print(
            f"Image conversion: {converted} created, {skipped} already present, {len(failures)} failed.",
            file=sys.stderr,
        )
        if failures:
            print("\n".join(failures), file=sys.stderr)
            return 1


    if args.replace_images:
        removed, retained = remove_replaced_images(source_root)
        print(
            f"Image replacement: {removed} originals removed after PDF validation; "
            f"{len(retained)} retained.",
            file=sys.stderr,
        )
        if retained:
            print("Unvalidated image replacements:\n" + "\n".join(retained), file=sys.stderr)
            return 1

    existing_data = load_existing(archive_path)
    today = date.today().isoformat()
    records = build_records(source_root, existing_data, today)
    errors = validate(records, source_root)
    if errors:
        print("Archive validation failed:", file=sys.stderr)
        print("\n".join(f"- {error}" for error in errors), file=sys.stderr)
        return 1

    output = {
        "config": {
            **existing_data.get("config", {}),
            "dataVersion": f"{today}-{len(records)}",
            "assetBaseUrl": MEDIA_ORIGIN,
        },
        "manuals": records,
        "soldUnits": existing_data.get("soldUnits", []),
    }

    if args.write:
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        archive_path.write_text(
            json.dumps(output, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        print(f"Wrote {len(records)} archive records to {archive_path}")
    else:
        converted_records = sum("converted image" in record["tags"] for record in records)
        print(f"Archive preview: {len(records)} PDFs ({converted_records} converted images)")
        for category, count in sorted(Counter(urlsplit(record["pdfUrl"]).path.split("/")[2] for record in records).items()):
            print(f"  {category}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
