//! Minimal INI document that keeps everything it does not understand.
//!
//! `notebook.mumbin` may carry sections and keys written by other programs or
//! plugins. Reading and writing through this type changes only the keys that
//! are set explicitly; every other line stays as it was.

#[derive(Debug, Clone, PartialEq, Eq)]
enum Line {
    Section(String),
    Entry {
        key: String,
        value: String,
    },
    /// Blank lines, comments and anything unparseable, kept verbatim.
    Other(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct IniDocument {
    lines: Vec<Line>,
}

impl IniDocument {
    pub fn parse(text: &str) -> Self {
        let text = text.strip_prefix('\u{feff}').unwrap_or(text);
        let lines = text
            .lines()
            .map(|line| {
                let trimmed = line.trim();
                if let Some(name) = trimmed
                    .strip_prefix('[')
                    .and_then(|rest| rest.strip_suffix(']'))
                {
                    Line::Section(name.trim().to_owned())
                } else if trimmed.starts_with(['#', ';']) || trimmed.is_empty() {
                    Line::Other(line.to_owned())
                } else if let Some((key, value)) = trimmed.split_once('=') {
                    Line::Entry {
                        key: key.trim().to_owned(),
                        value: value.trim().to_owned(),
                    }
                } else {
                    Line::Other(line.to_owned())
                }
            })
            .collect();
        IniDocument { lines }
    }

    /// Value of `key` in `section`; an empty value counts as not set.
    pub fn get(&self, section: &str, key: &str) -> Option<&str> {
        let mut current = "";
        for line in &self.lines {
            match line {
                Line::Section(name) => current = name,
                Line::Entry { key: found, value } if current == section && found == key => {
                    return (!value.is_empty()).then_some(value.as_str());
                }
                _ => {}
            }
        }
        None
    }

    /// Sets `key` in `section`, creating the section at the end if needed.
    pub fn set(&mut self, section: &str, key: &str, value: &str) {
        let mut in_section = false;
        let mut existing = None;
        let mut section_end = None;
        for (index, line) in self.lines.iter().enumerate() {
            match line {
                Line::Section(name) => in_section = name == section,
                Line::Entry { key: found, .. } if in_section && found == key => {
                    existing = Some(index);
                    break;
                }
                _ => {}
            }
            // New keys go right after the section's last key, before any
            // blank line or comment that introduces the next section.
            if in_section && !matches!(line, Line::Other(_)) {
                section_end = Some(index + 1);
            }
        }
        if let Some(Line::Entry { value: old, .. }) = existing.map(|index| &mut self.lines[index]) {
            value.clone_into(old);
            return;
        }
        let entry = Line::Entry {
            key: key.to_owned(),
            value: value.to_owned(),
        };
        if let Some(index) = section_end {
            self.lines.insert(index, entry);
            return;
        }
        if !self.lines.is_empty() {
            self.lines.push(Line::Other(String::new()));
        }
        self.lines.push(Line::Section(section.to_owned()));
        self.lines.push(entry);
    }

    /// The names of all sections, in file order.
    pub fn get_section_names(&self) -> impl Iterator<Item = &str> {
        self.lines.iter().filter_map(|line| match line {
            Line::Section(name) => Some(name.as_str()),
            _ => None,
        })
    }

    /// Removes a section with all its keys, and the comments and blank lines in front of the
    /// next one that belong to it. Returns whether there was such a section.
    pub fn remove_section(&mut self, section: &str) -> bool {
        let Some(start) = self
            .lines
            .iter()
            .position(|line| matches!(line, Line::Section(name) if name == section))
        else {
            return false;
        };
        let end = self.lines[start + 1..]
            .iter()
            .position(|line| matches!(line, Line::Section(_)))
            .map_or(self.lines.len(), |offset| start + 1 + offset);
        self.lines.drain(start..end);
        // At the end of the file the blank line that separated it from what came before goes too.
        if start > 0
            && start == self.lines.len()
            && matches!(self.lines.get(start - 1), Some(Line::Other(text)) if text.trim().is_empty())
        {
            self.lines.remove(start - 1);
        }
        true
    }

    pub fn serialise(&self, line_ending: &str) -> String {
        let mut out = String::new();
        for line in &self.lines {
            match line {
                Line::Section(name) => {
                    out.push('[');
                    out.push_str(name);
                    out.push(']');
                }
                Line::Entry { key, value } => {
                    out.push_str(key);
                    out.push('=');
                    out.push_str(value);
                }
                Line::Other(text) => out.push_str(text),
            }
            out.push_str(line_ending);
        }
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "[Notebook]\nversion=0.4\nname=Notizen\nicon=\nshared=True\n\n# keep me\n[Extra]\nnamespace=Extra\nodd line\n";

    #[test]
    fn a_section_can_be_removed_with_its_keys() {
        let mut ini =
            IniDocument::parse("[Notebook]\nname=A\n\n[Gone]\nx=1\ny=2\n\n[Other]\nk=v\n");
        assert!(ini.remove_section("Gone"));
        assert!(!ini.remove_section("Gone"));
        assert_eq!(ini.serialise("\n"), "[Notebook]\nname=A\n\n[Other]\nk=v\n");
        let mut last = IniDocument::parse("[Notebook]\nname=A\n\n[Gone]\nx=1\n");
        assert!(last.remove_section("Gone"));
        assert_eq!(last.serialise("\n"), "[Notebook]\nname=A\n");
    }

    #[test]
    fn reads_values_per_section() {
        let ini = IniDocument::parse(SAMPLE);
        assert_eq!(ini.get("Notebook", "name"), Some("Notizen"));
        assert_eq!(ini.get("Notebook", "icon"), None);
        assert_eq!(ini.get("Notebook", "namespace"), None);
        assert_eq!(ini.get("Extra", "namespace"), Some("Extra"));
        assert_eq!(ini.get("Notebook", "shared"), Some("True"));
    }

    #[test]
    fn untouched_document_round_trips() {
        assert_eq!(IniDocument::parse(SAMPLE).serialise("\n"), SAMPLE);
    }

    #[test]
    fn set_changes_only_the_requested_key() {
        let mut ini = IniDocument::parse(SAMPLE);
        ini.set("Notebook", "name", "Neu");
        ini.set("Notebook", "home", "Start");
        ini.set("Other", "k", "v");
        assert_eq!(
            ini.serialise("\n"),
            "[Notebook]\nversion=0.4\nname=Neu\nicon=\nshared=True\nhome=Start\n\n# keep me\n[Extra]\nnamespace=Extra\nodd line\n\n[Other]\nk=v\n"
        );
    }

    #[test]
    fn set_on_empty_document_creates_the_section() {
        let mut ini = IniDocument::default();
        ini.set("Notebook", "name", "A");
        assert_eq!(ini.serialise("\r\n"), "[Notebook]\r\nname=A\r\n");
    }
}
