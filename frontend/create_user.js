import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://anlkjdlixiwespogdozf.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6Im1yay00MzAyZWMxYjY3MGY0OGE5OGFkNjFkYWRlNGEyM2JlNyJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFubGtqZGxpeGl3ZXNwb2dkb3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4Mjg1MTAsImV4cCI6MjA5NjQwNDUxMH0.9bWIwYHm28OXW2gDEYW6JOTjR10XtnceDJ-l0U9NuDc";

const supabase = createClient(supabaseUrl, supabaseKey);

async function register() {
  const { data, error } = await supabase.auth.signUp({
    email: "vedasaradhiv@gmail.com",
    password: "BADBOYveda9626@",
    options: {
      data: {
        name: "Veda Sarathi",
        role: "trainer"
      }
    }
  });

  if (error) {
    console.error("Registration failed:", error.message);
  } else {
    console.log("Registration success:", data);
  }
}

register();
