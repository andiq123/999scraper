package mailer

import (
	"strings"
	"testing"
)

func TestProviderInference(t *testing.T) {
	tests := map[string]string{
		"alerts@gmail.com":   "smtp.gmail.com",
		"alerts@outlook.com": "smtp.office365.com",
		"alerts@yahoo.com":   "smtp.mail.yahoo.com",
		"alerts@icloud.com":  "smtp.mail.me.com",
	}
	for email, expected := range tests {
		host, port, err := Provider(email)
		if err != nil || host != expected || port != 587 {
			t.Fatalf("Provider(%q) = %q:%d, %v", email, host, port, err)
		}
	}
	if _, _, err := Provider("alerts@custom.example"); err == nil {
		t.Fatal("accepted an unsupported provider")
	}
}

func TestParseMailboxRejectsHeaderAndDisplayName(t *testing.T) {
	for _, value := range []string{"Alerts <alerts@gmail.com>", "alerts@gmail.com\r\nBcc: target@example.com", "not-an-email"} {
		if _, err := ParseMailbox(value); err == nil {
			t.Fatalf("accepted invalid mailbox %q", value)
		}
	}
}

func TestMessageContainsMultipartBodies(t *testing.T) {
	from, _ := ParseMailbox("alerts@gmail.com")
	to, _ := ParseMailbox("target@example.com")
	content := message(from, to, "New listing", "Plain body", "<b>HTML body</b>")
	for _, expected := range []string{"multipart/alternative", "Plain body", "<b>HTML body</b>", "Subject: New listing"} {
		if !strings.Contains(content, expected) {
			t.Fatalf("message is missing %q", expected)
		}
	}
}
