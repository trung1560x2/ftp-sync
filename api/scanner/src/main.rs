use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

struct FileItem {
    name: String,
    is_directory: bool,
    size: u64,
    modified_at_ms: u128,
    rel_path: String,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    let mut path_str = String::new();
    let mut recursive = false;
    let mut ignored_folders = Vec::new();

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--path" => {
                if i + 1 < args.len() {
                    path_str = args[i + 1].clone();
                    i += 2;
                } else {
                    i += 1;
                }
            }
            "--recursive" => {
                recursive = true;
                i += 1;
            }
            "--ignored" => {
                if i + 1 < args.len() {
                    ignored_folders = args[i + 1]
                        .split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();
                    i += 2;
                } else {
                    i += 1;
                }
            }
            _ => {
                i += 1;
            }
        }
    }

    if path_str.is_empty() {
        eprintln!("Error: --path is required");
        std::process::exit(1);
    }

    let root_path = Path::new(&path_str);
    if !root_path.exists() {
        println!("[]");
        return;
    }

    let mut results = Vec::new();
    scan_dir(root_path, root_path, recursive, &ignored_folders, 0, &mut results);

    print_json(&results);
}

fn scan_dir(
    dir: &Path,
    base: &Path,
    recursive: bool,
    ignored: &[String],
    depth: usize,
    results: &mut Vec<FileItem>,
) {
    if depth > 8 {
        return;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = match path.file_name() {
                Some(name) => name.to_string_lossy().to_string(),
                None => continue,
            };

            let is_dir = path.is_dir();

            if recursive && is_dir && ignored.contains(&file_name) {
                continue;
            }

            let metadata = match fs::metadata(&path) {
                Ok(meta) => meta,
                Err(_) => continue,
            };

            let size = metadata.len();
            let modified_at_ms = match metadata.modified() {
                Ok(time) => match time.duration_since(UNIX_EPOCH) {
                    Ok(dur) => dur.as_millis(),
                    Err(_) => 0,
                },
                Err(_) => 0,
            };

            let rel_path = match path.strip_prefix(base) {
                Ok(p) => p.to_string_lossy().replace('\\', "/"),
                Err(_) => continue,
            };

            results.push(FileItem {
                name: file_name.clone(),
                is_directory: is_dir,
                size,
                modified_at_ms,
                rel_path,
            });

            if recursive && is_dir {
                scan_dir(&path, base, true, ignored, depth + 1, results);
            }
        }
    }
}

fn print_json(items: &[FileItem]) {
    print!("[");
    for (idx, item) in items.iter().enumerate() {
        if idx > 0 {
            print!(",");
        }
        let escaped_name = escape_json(&item.name);
        let escaped_rel_path = escape_json(&item.rel_path);

        print!(
            r#"{{"name":"{}","isDirectory":{},"size":{},"modifiedAt":{},"relPath":"{}"}}"#,
            escaped_name,
            item.is_directory,
            item.size,
            item.modified_at_ms,
            escaped_rel_path
        );
    }
    println!("]");
}

fn escape_json(s: &str) -> String {
    let mut escaped = String::new();
    for c in s.chars() {
        match c {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            _ => escaped.push(c),
        }
    }
    escaped
}
