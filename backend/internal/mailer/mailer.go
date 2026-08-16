package mailer

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type Config struct {
	FromEmail   string
	AppPassword string
	Host        string
	Port        int
}

type Sender struct {
	config Config
	from   mail.Address
	addr   string
}

func New(config Config) (*Sender, error) {
	from, err := ParseMailbox(config.FromEmail)
	if err != nil {
		return nil, fmt.Errorf("SMTP_FROM_EMAIL: %w", err)
	}
	if strings.TrimSpace(config.AppPassword) == "" {
		return nil, fmt.Errorf("SMTP_APP_PASSWORD is required when SMTP_FROM_EMAIL is set")
	}
	if config.Host == "" || config.Port < 1 || config.Port > 65535 {
		return nil, fmt.Errorf("unsupported SMTP provider for %s", domain(from.Address))
	}
	return &Sender{config: config, from: mail.Address{Name: "999 search alerts", Address: from.Address}, addr: net.JoinHostPort(config.Host, fmt.Sprint(config.Port))}, nil
}

func Provider(email string) (host string, port int, err error) {
	address, err := ParseMailbox(email)
	if err != nil {
		return "", 0, err
	}
	switch domain(address.Address) {
	case "gmail.com", "googlemail.com":
		return "smtp.gmail.com", 587, nil
	case "outlook.com", "hotmail.com", "live.com", "msn.com":
		return "smtp.office365.com", 587, nil
	case "yahoo.com", "yahoo.co.uk", "ymail.com":
		return "smtp.mail.yahoo.com", 587, nil
	case "icloud.com", "me.com", "mac.com":
		return "smtp.mail.me.com", 587, nil
	default:
		return "", 0, fmt.Errorf("no automatic SMTP settings are available for %s", domain(address.Address))
	}
}

func ParseMailbox(value string) (mail.Address, error) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 254 || strings.ContainsAny(value, "\r\n") {
		return mail.Address{}, fmt.Errorf("enter a valid email address")
	}
	address, err := mail.ParseAddress(value)
	if err != nil || !strings.EqualFold(address.Address, value) || address.Name != "" {
		return mail.Address{}, fmt.Errorf("enter one email address without a display name")
	}
	local, host, ok := strings.Cut(address.Address, "@")
	if !ok || local == "" || !strings.Contains(host, ".") {
		return mail.Address{}, fmt.Errorf("enter a valid email address")
	}
	address.Address = strings.ToLower(address.Address)
	return *address, nil
}

func (s *Sender) Send(ctx context.Context, to, subject, textBody, htmlBody string) error {
	recipient, err := ParseMailbox(to)
	if err != nil {
		return err
	}
	if strings.ContainsAny(subject, "\r\n") {
		return fmt.Errorf("invalid email subject")
	}
	dialer := net.Dialer{Timeout: 12 * time.Second}
	connection, err := dialer.DialContext(ctx, "tcp", s.addr)
	if err != nil {
		return fmt.Errorf("connect to SMTP provider: %w", err)
	}
	defer connection.Close()
	client, err := smtp.NewClient(connection, s.config.Host)
	if err != nil {
		return fmt.Errorf("start SMTP session: %w", err)
	}
	defer client.Close()
	if err := client.StartTLS(&tls.Config{ServerName: s.config.Host, MinVersion: tls.VersionTLS12}); err != nil {
		return fmt.Errorf("secure SMTP session: %w", err)
	}
	if err := client.Auth(smtp.PlainAuth("", s.from.Address, s.config.AppPassword, s.config.Host)); err != nil {
		return fmt.Errorf("authenticate SMTP sender: %w", err)
	}
	if err := client.Mail(s.from.Address); err != nil {
		return fmt.Errorf("set SMTP sender: %w", err)
	}
	if err := client.Rcpt(recipient.Address); err != nil {
		return fmt.Errorf("set SMTP recipient: %w", err)
	}
	writer, err := client.Data()
	if err != nil {
		return fmt.Errorf("open SMTP message: %w", err)
	}
	if _, err := io.WriteString(writer, message(s.from, recipient, subject, textBody, htmlBody)); err != nil {
		_ = writer.Close()
		return fmt.Errorf("write SMTP message: %w", err)
	}
	if err := writer.Close(); err != nil {
		return fmt.Errorf("send SMTP message: %w", err)
	}
	if err := client.Quit(); err != nil {
		return fmt.Errorf("finish SMTP session: %w", err)
	}
	return nil
}

func message(from, to mail.Address, subject, textBody, htmlBody string) string {
	boundary := "999-" + randomID()
	var output strings.Builder
	formatted := bufio.NewWriter(&output)
	fmt.Fprintf(formatted, "From: %s\r\n", from.String())
	fmt.Fprintf(formatted, "To: %s\r\n", to.String())
	fmt.Fprintf(formatted, "Subject: %s\r\n", subject)
	fmt.Fprintf(formatted, "Date: %s\r\n", time.Now().Format(time.RFC1123Z))
	fmt.Fprintf(formatted, "Message-ID: <%s@999scraper>\r\n", randomID())
	fmt.Fprint(formatted, "MIME-Version: 1.0\r\n")
	fmt.Fprintf(formatted, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", boundary)
	fmt.Fprintf(formatted, "--%s\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n", boundary, normalizeBody(textBody))
	fmt.Fprintf(formatted, "--%s\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n", boundary, normalizeBody(htmlBody))
	fmt.Fprintf(formatted, "--%s--\r\n", boundary)
	_ = formatted.Flush()
	return output.String()
}

func normalizeBody(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\r\n", "\n"), "\n", "\r\n")
}

func randomID() string {
	buffer := make([]byte, 12)
	if _, err := rand.Read(buffer); err != nil {
		return fmt.Sprint(time.Now().UnixNano())
	}
	return hex.EncodeToString(buffer)
}

func domain(address string) string {
	_, value, _ := strings.Cut(strings.ToLower(address), "@")
	return value
}
